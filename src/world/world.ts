import {Chunk, ChunkSpriteSheets, CHUNK_SIZE} from "./chunk";
import {Tile} from "./tile";
import {Entity} from "../entities/entity";
import {MovableEntity} from "../entities/movable-entity";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {DebugHud, ChunkState} from "../debug/debug-hud";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";
import {AnimatedBackgroundTileSpriteSheet} from "../sprites/AnimatedBackgroundTileSpriteSheet";
import {buildStructureSheetRegistry} from "./structure-sheet-dispatch";
import {ChunkGenerator} from "./generation/chunk/chunk-generator";
import {DEFAULT_FEATURE_PROVIDERS} from "./generation/feature/default-features";
import {ChunkWorkerClient} from "./generation/chunk/chunk-worker-client";
import {FeatureTag} from "./generation/feature/feature-tag";
import {BiomeSummary} from "./generation/biome/biome";
import {SpriteFrame, SpriteTile} from "../sprites/sprite";
import {CoordMap, CoordSet} from "./coord-set";
import {Effect} from "../effects/effect";
import {requireNonNull} from "../util";
import {getFieldGradient, sampleGradient} from "./generation/noise-field-colors";
import {BIOME_COLORS} from "./generation/biome/biome-colors";
import {Minimap, MinimapData} from "../minimap/minimap";
import {Structure, StructurePieceInstance} from "./generation/structure/structure";
import {ConvexPolygon, convexPolygonsIntersect, rectPolygon} from "../geometry/convex-polygon";
import {CollisionResponseKind} from "../geometry/collision-response";
import {applyCollisionResponse, CollisionContext} from "./collision";
import {EntityHoverInfo, TileHoverInfo} from "./hover-info";

/** A chunk's position, in chunk units (not tiles/pixels). */
export interface ChunkCoordinate {
    chunkX: number;
    chunkY: number;
}

/** A rectangular range of chunk coordinates, inclusive of both ends. */
interface ChunkRange {
    startChunkX: number;
    startChunkY: number;
    endChunkX: number;
    endChunkY: number;
}

/** Everything {@link World.drawDebugHud} needs besides the canvas context and camera. */
interface DebugHudOptions {
    /** Whether spectator mode is currently active. */
    spectating: boolean;
    /** Camera's current pan velocity while spectating; ignored otherwise. */
    spectatorVelocity: Vector2d;
    /** Currently measured rendering FPS. */
    actualFps: number;
    /** Configured FPS cap, or `undefined` when uncapped. */
    targetFps: number | undefined;
}

/**
 * The game world: an effectively infinite 2D grid of tiles, split into
 * fixed-size {@link Chunk}s that are generated on demand and cached in
 * memory as they're needed.
 */
export class World {
    /** How many extra chunks to keep loaded beyond the camera's visible view, in every direction. */
    private static readonly CHUNK_BUFFER = 2;

    /** Fill colour for the "void" - camera-visible area outside every loaded chunk. */
    private static readonly VOID_COLOR = "#000000";

    private readonly chunks = new CoordMap<Chunk>();
    private readonly entities: Entity[] = [];

    /** Routes a structure piece's sprite string to whichever biome sheet actually defines it. */
    private readonly structureSheetRegistry = buildStructureSheetRegistry();

    private readonly chunkSpriteSheets: ChunkSpriteSheets = {
        backgroundTile: new BackgroundTileSpriteSheet(),
        animatedBackgroundTile: new AnimatedBackgroundTileSpriteSheet(),
        getStructureSpriteBitmap: (sprite) => this.structureSheetRegistry.findSheet(sprite).getTileBitmap(sprite),
        getStructureCollisionPolygon: (sprite, centerX, centerY, tileSize) =>
            this.structureCollisionPolygonForSprite(sprite, centerX, centerY, tileSize),
    };

    /** Total elapsed time on the shared clock animated background tiles (e.g. water) read their phase from - see {@link Tile.draw}. Advanced every {@link update}. */
    private animationElapsedMs = 0;
    /** Used only for {@link getNoiseFieldNames}/{@link drawNoiseFieldOverlay} - actual chunk generation runs on {@link chunkWorkerClient}. */
    private chunkGenerator: ChunkGenerator;
    private chunkWorkerClient: ChunkWorkerClient;
    private worldSeed: number;
    /** Debug knob: minimum time the worker leaves between finishing one chunk and starting the next. `0` disables it - see {@link setMinChunkGenerationDelayMs}. */
    private minChunkGenerationDelayMs = 0;
    private readonly debugHud = new DebugHud();
    private readonly minimap = new Minimap();

    /** Whether the minimap is currently shown - independent of {@link DebugController.isEnabled}, defaults to visible. See {@link getMinimapEnabled}/{@link setMinimapEnabled}. */
    private minimapEnabled = true;

    /** Every currently active {@link Effect}, driven generically by {@link update}/{@link draw} - see {@link registerEffect}. */
    private effects: Effect[] = [];

    /**
     * The entity currently under player control - `undefined` until
     * {@link setMainEntity} is called at least once. `World` never assumes
     * one exists on its own; callers must set one up before driving
     * {@link update}/{@link draw}.
     */
    private mainEntity: MovableEntity | undefined;

    /**
     * Which entity/obstacle most recently overlapped, for the debug HUD's
     * collision indicator - `undefined` once cleared. Stays put across
     * ticks where the colliding entity doesn't move again (see
     * {@link handleCollisions}), so bumping into something and getting
     * pushed back out still reads as `true` in the HUD right up until the
     * entity is actually moved again - not just for the single tick contact
     * happened, which would be easy to miss.
     */
    private lastCollision: {entityLabel: string; obstacleLabel: string} | undefined;

    /** Sum of every generated chunk's {@link Chunk.generationTimeMs}, for {@link getAverageChunkGenerationTimeMs}. */
    private totalChunkGenerationTimeMs = 0;
    /** Count of chunks contributing to {@link totalChunkGenerationTimeMs}. */
    private generatedChunkCount = 0;
    /** {@link Chunk.generationTimeMs} of the most recently generated chunk, for the debug HUD. */
    private latestChunkGenerationTimeMs = 0;
    /** Chunk count the last {@link draw} call rendered, for the debug HUD. */
    private lastVisibleChunkCount = 0;

    /**
     * Cached biome-region BFS results, keyed by biome. Each entry is valid as
     * long as its anchor chunk (the player's chunk when the BFS ran) is still
     * loaded. Cleared on seed change.
     */
    private readonly biomeRegionCache = new Map<BiomeSummary, {
        count: number;
        isPartial: boolean;
        anchorChunkX: number;
        anchorChunkY: number;
    }>();

    /** Chunk {@link getChunkGenerationFocus} was in as of the last {@link reorderChunkGenerationQueueIfFocusMoved} call - `undefined` before the first call. */
    private lastChunkGenerationFocusChunk: ChunkCoordinate | undefined;

    /**
     * Whether new chunks may be generated. If areas outside generated
     * chunks come into viewport, show void instead.
     */
    private generationEnabled = true;

    /**
     * Whether entities may move onto a chunk that hasn't finished generating
     * yet. `false` by default, so the main entity stays constrained to
     * already-generated ground instead of wandering into a chunk that's
     * still a placeholder - see {@link constrainEntitiesToChunks}.
     */
    private canMoveOntoGeneratingChunks = false;

    /**
     * @param tileSize - Width/height of a single tile, in canvas pixels.
     * @param worldSeed - Seed every chunk's terrain generation is sampled from. Defaults to a
     * fresh random seed, so revisiting the same chunk within one `World` instance is
     * deterministic, but different play sessions get different terrain.
     */
    public constructor(public readonly tileSize: number, worldSeed: number = World.randomSeed()) {
        this.worldSeed = worldSeed;
        this.chunkGenerator = new ChunkGenerator(worldSeed, DEFAULT_FEATURE_PROVIDERS);
        this.chunkWorkerClient = new ChunkWorkerClient(worldSeed);
    }

    /**
     * Registers an {@link Effect} to be advanced every simulation tick (see
     * {@link update}) and drawn behind entities every frame (see
     * {@link draw}) until it expires. Lets transient visual systems - the
     * cyan dash trail, particle effects or similar later - plug into `World`
     * without it growing a bespoke field/update/draw call for each one, and
     * without `World` needing to know about any specific effect's concrete
     * type.
     *
     * @param effect - Effect to register.
     */
    public registerEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    /**
     * A fresh random seed, in the same range as {@link ChunkGenerator} expects.
     */
    private static randomSeed(): number {
        return Math.floor(Math.random() * 0xffffffff);
    }

    /**
     * The seed currently used to generate new chunks.
     *
     * @returns The current world seed.
     */
    public getWorldSeed(): number {
        return this.worldSeed;
    }

    /**
     * Changes the seed used to generate new chunks. Already-loaded chunks
     * are left as they are - only chunks generated from now on use `seed`.
     *
     * @param seed - The new world seed.
     */
    public setWorldSeed(seed: number): void {
        this.worldSeed = seed;
        this.chunkGenerator.setSeed(seed);
        this.chunkWorkerClient.setSeed(seed);
        this.biomeRegionCache.clear();
    }

    /**
     * Replaces the world seed with a fresh random one - see {@link setWorldSeed}.
     */
    public refreshWorldSeed(): void {
        this.setWorldSeed(World.randomSeed());
    }

    /**
     * Debug knob: minimum time the worker leaves between finishing one
     * chunk's generation and starting the next, for testing that the UI
     * stays responsive while chunks are generating.
     *
     * @returns The current minimum delay, in milliseconds. `0` means disabled.
     */
    public getMinChunkGenerationDelayMs(): number {
        return this.minChunkGenerationDelayMs;
    }

    /**
     * Sets the minimum-delay-between-chunks debug knob - see
     * {@link getMinChunkGenerationDelayMs}. Takes effect immediately on the
     * currently running worker, and persists across a {@link setWorldSeed}.
     *
     * @param delayMs - Minimum milliseconds to leave between chunks. `0` disables the delay.
     */
    public setMinChunkGenerationDelayMs(delayMs: number): void {
        this.minChunkGenerationDelayMs = delayMs;
        this.chunkWorkerClient.setMinGenerationDelayMs(delayMs);
    }

    /**
     * Converts a world tile position into the coordinate of the chunk that
     * contains it.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The containing chunk's coordinate, in chunk units.
     */
    public static tileToChunk(tileX: number, tileY: number): ChunkCoordinate {
        return {
            chunkX: Math.floor(tileX / CHUNK_SIZE),
            chunkY: Math.floor(tileY / CHUNK_SIZE),
        };
    }

    /**
     * Returns the chunk at the given chunk coordinate, generating and
     * caching it first if it hasn't been loaded yet.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns The loaded chunk.
     */
    public getChunk(chunkX: number, chunkY: number): Chunk {
        let chunk = this.chunks.get(chunkX, chunkY);
        if (!chunk) {
            const generation = this.chunkWorkerClient.requestChunk(chunkX, chunkY);
            chunk = new Chunk(chunkX, chunkY, generation, this.chunkSpriteSheets, this.tileSize);
            this.chunks.set(chunkX, chunkY, chunk);
            generation
                .then((result) => {
                    this.latestChunkGenerationTimeMs = result.generationTimeMs;
                    this.totalChunkGenerationTimeMs += result.generationTimeMs;
                    this.generatedChunkCount++;
                })
                .catch(() => {
                    // Worker terminated (e.g. a seed change) before this chunk finished; don't count it.
                });
        }
        return chunk;
    }

    /**
     * How many chunks are currently loaded in memory.
     *
     * @returns The loaded chunk count.
     */
    public getLoadedChunkCount(): number {
        return this.chunks.size;
    }

    /**
     * The worker client driving chunk generation - for debugging (see
     * `exposeGlobals`), e.g. to inspect pending chunks or set the min
     * generation delay from the console while the app is running. The same
     * instance for this `World`'s whole lifetime.
     *
     * @returns The current chunk worker client.
     */
    public getChunkWorkerClient(): ChunkWorkerClient {
        return this.chunkWorkerClient;
    }

    /**
     * How many currently loaded chunks are still generating, for the debug HUD.
     *
     * @returns The generating chunk count.
     */
    public getGeneratingChunkCount(): number {
        let count = 0;
        for (const chunk of this.chunks.values()) {
            if (!chunk.isReady()) {
                count++;
            }
        }
        return count;
    }

    /**
     * Mean {@link Chunk.generationTimeMs} across every chunk generated so
     * far this session, for the debug HUD.
     *
     * @returns The average chunk generation time, in milliseconds, or `0` if nothing has been generated yet.
     */
    public getAverageChunkGenerationTimeMs(): number {
        return this.generatedChunkCount === 0 ? 0 : this.totalChunkGenerationTimeMs / this.generatedChunkCount;
    }

    /**
     * {@link Chunk.generationTimeMs} of the most recently generated chunk,
     * for the debug HUD.
     *
     * @returns The latest chunk generation time, in milliseconds, or `0` if nothing has been generated yet.
     */
    public getLatestChunkGenerationTimeMs(): number {
        return this.latestChunkGenerationTimeMs;
    }

    /**
     * Whether the chunk at the given chunk coordinate is currently loaded in
     * memory, without generating it if it isn't.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns `true` if the chunk is loaded.
     */
    public isChunkLoaded(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(chunkX, chunkY);
    }

    /**
     * Drops a chunk from memory. Safe to call on a chunk that isn't loaded.
     * Since chunk deltas aren't persisted yet, any edits made to the chunk
     * are lost; once storage exists, this is where a dirty chunk would be
     * flushed before being evicted.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     */
    public unloadChunk(chunkX: number, chunkY: number): void {
        this.chunks.delete(chunkX, chunkY);
    }

    /**
     * Drops every currently loaded chunk from memory, cancelling any
     * still-pending generation requests for them.
     */
    public reloadAllChunks(): void {
        this.chunkWorkerClient.cancelPending();
        this.chunks.clear();
    }

    /**
     * Whether new chunks may currently be generated.
     *
     * @returns `true` if chunk generation is enabled.
     */
    public isGenerationEnabled(): boolean {
        return this.generationEnabled;
    }

    /**
     * Enables/disables chunk generation. When generation is disabled,
     * also clears the pending generation queue.
     *
     * @param enabled - Whether chunk generation should be enabled.
     */
    public setGenerationEnabled(enabled: boolean): void {
        this.generationEnabled = enabled;
        if (!enabled) {
            this.cancelPendingChunkGeneration();
        }
    }

    /**
     * Whether the minimap is currently shown.
     *
     * @returns `true` if the minimap is enabled.
     */
    public getMinimapEnabled(): boolean {
        return this.minimapEnabled;
    }

    /**
     * Enables/disables the minimap. Independent of {@link DebugController.isEnabled} -
     * the minimap is a normal gameplay element, not a debug one. No special
     * handling is needed on re-enable: the tracked bitmap centre is simply
     * stale, which {@link Minimap.draw}'s own large-jump fallback already
     * treats as a full resample (see `Minimap.updateBitmap`).
     *
     * @param enabled - Whether the minimap should be shown.
     */
    public setMinimapEnabled(enabled: boolean): void {
        this.minimapEnabled = enabled;
    }

    /**
     * Cancels every chunk generation request still queued or in flight on
     * {@link chunkWorkerClient}, and drops the corresponding not-yet-ready
     * chunks from {@link chunks}.
     */
    private cancelPendingChunkGeneration(): void {
        this.chunkWorkerClient.cancelPending();
        const toDelete = [...this.chunks.values()].filter(c => !c.isReady());
        for (const chunk of toDelete) {
            this.chunks.delete(chunk.chunkX, chunk.chunkY);
        }
    }

    /**
     * Whether entities may currently move onto a still-generating chunk.
     *
     * @returns `true` if entities aren't constrained to already-generated ground.
     */
    public getCanMoveOntoGeneratingChunks(): boolean {
        return this.canMoveOntoGeneratingChunks;
    }

    /**
     * Enables/disables movement onto still-generating chunks.
     *
     * @param canMove - Whether entities may move onto a still-generating chunk.
     */
    public setCanMoveOntoGeneratingChunks(canMove: boolean): void {
        this.canMoveOntoGeneratingChunks = canMove;
    }

    /**
     * Whether every chunk overlapped by a `frame`-sized rectangle at
     * `position` is both loaded and satisfies `predicate`.
     *
     * @param position - Rectangle's centre point, in world pixels.
     * @param frame - Sprite frame whose width/height define the rectangle.
     * @param predicate - Only chunks this returns `true` for count as valid ground.
     * @returns `true` if every overlapped chunk is loaded and satisfies `predicate`.
     */
    private isPositionOnValidGround(position: Vector2d, frame: SpriteFrame, predicate: (chunk: Chunk) => boolean): boolean {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const startChunkX = Math.floor((position.x - frame.w / 2) / chunkPixelSize);
        const startChunkY = Math.floor((position.y - frame.h / 2) / chunkPixelSize);
        const endChunkX = Math.floor((position.x + frame.w / 2 - 1) / chunkPixelSize);
        const endChunkY = Math.floor((position.y + frame.h / 2 - 1) / chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const chunk = this.chunks.get(chunkX, chunkY);
                if (!chunk || !predicate(chunk)) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Stops every {@link MovableEntity} in {@link entities} from ending this
     * tick standing anywhere that doesn't satisfy `predicate`.
     *
     * @param previousPositions - Each entity's position before this tick's movement, to fall back to/slide from.
     * @param predicate - Only chunks this returns `true` for count as valid ground.
     */
    private constrainEntitiesToChunks(previousPositions: ReadonlyMap<MovableEntity, Vector2d>, predicate: (chunk: Chunk) => boolean): void {
        for (const entity of this.entities) {
            if (!(entity instanceof MovableEntity)) {
                continue;
            }
            const previous = previousPositions.get(entity);
            if (!previous) {
                continue;
            }

            const current = entity.getPosition();
            const frame = entity.getCurrentFrame();
            if (this.isPositionOnValidGround(current, frame, predicate)) {
                continue;
            }

            const slideX = new Vector2d(current.x, previous.y);
            const slideY = new Vector2d(previous.x, current.y);
            if (this.isPositionOnValidGround(slideX, frame, predicate)) {
                entity.teleportTo(slideX);
            } else if (this.isPositionOnValidGround(slideY, frame, predicate)) {
                entity.teleportTo(slideY);
            } else {
                entity.teleportTo(previous);
            }
        }
    }

    /**
     * Looks up the tile at the given world tile position, generating its
     * containing chunk first if necessary.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The tile at that position.
     */
    public getTile(tileX: number, tileY: number): Tile {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.getChunk(chunkX, chunkY);
        return chunk.getTile(tileX - chunkX * CHUNK_SIZE, tileY - chunkY * CHUNK_SIZE);
    }

    /** Returns a tile only when its containing chunk is already loaded and ready. */
    private getReadyTile(tileX: number, tileY: number): Tile | undefined {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.chunks.get(chunkX, chunkY);
        if (!chunk?.isReady()) {
            return undefined;
        }
        return chunk.getTile(tileX - chunkX * CHUNK_SIZE, tileY - chunkY * CHUNK_SIZE);
    }

    /** Returns the structure piece anchored at a world tile position only when its containing chunk is already loaded and ready. */
    private getReadyStructurePieceAt(tileX: number, tileY: number): StructurePieceInstance | undefined {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.chunks.get(chunkX, chunkY);
        if (!chunk?.isReady()) {
            return undefined;
        }
        return chunk.getStructurePieceAt(tileX, tileY);
    }

    /**
     * Everything the debug hover tooltip (see `HoverTooltip`) shows about the
     * tile at a world tile position - ground/biome/feature, its own
     * collidability, and any structure piece occupying it. Never triggers
     * generation - see {@link getReadyTile}/{@link getReadyStructurePieceAt} -
     * since the tooltip only reads from chunks already loaded/rendered.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The tile's hover info, or `undefined` if its containing chunk isn't ready yet.
     */
    public getTileHoverInfo(tileX: number, tileY: number): TileHoverInfo | undefined {
        const tile = this.getReadyTile(tileX, tileY);
        if (!tile) {
            return undefined;
        }
        const piece = this.getReadyStructurePieceAt(tileX, tileY);
        return {
            tileX,
            tileY,
            groundType: tile.getDisplayGroundType(this.animationElapsedMs),
            biomeTag: tile.biomeTag,
            featureTag: tile.featureTag,
            collision: tile.getCollision(tileX, tileY, this.tileSize)?.response,
            animated: tile.getAnimationInfo(),
            structure: piece && {
                sprites: piece.sprites,
                structureId: piece.structureId,
                layer: piece.layer,
                collision: piece.collision !== "none" ? piece.collision : undefined,
            },
        };
    }

    /**
     * Everything the debug hover tooltip shows about whichever entity's
     * drawn rectangle contains a world-pixel point, if any. Checked topmost
     * (last-drawn) entity first, since that's what the cursor would actually
     * appear to be over.
     *
     * @param worldX - X position to test, in world pixels.
     * @param worldY - Y position to test, in world pixels.
     * @returns The topmost entity's hover info at that point, or `undefined` if none is there.
     */
    public getEntityHoverInfo(worldX: number, worldY: number): EntityHoverInfo | undefined {
        for (let i = this.entities.length - 1; i >= 0; i--) {
            const entity = this.entities[i];
            const rect = entity.getBoundingRect();
            if (worldX < rect.x || worldX >= rect.x + rect.w || worldY < rect.y || worldY >= rect.y + rect.h) {
                continue;
            }
            const position = entity.getPosition();
            const velocity = entity instanceof MovableEntity && entity.isMoving() ? entity.getVelocity() : undefined;
            return {
                name: entity instanceof MovableEntity ? entity.getDisplayName() : entity.getRegistryId(),
                x: position.x,
                y: position.y,
                status: entity.getStatus(),
                velocity: velocity && {x: velocity.x, y: velocity.y},
            };
        }
        return undefined;
    }

    /**
     * BFS from `(chunkX, chunkY)` over loaded, ready chunks whose
     * `biomeSummary` matches `biome`, returning the connected-region size.
     * `isPartial` is `true` when the region reaches an unloaded or
     * still-generating chunk - meaning the true size is at least `count`.
     * Results are cached per biome and reused as long as the anchor chunk
     * (the player's chunk when the BFS ran) remains loaded.
     *
     * @param chunkX - Player's current chunk X.
     * @param chunkY - Player's current chunk Y.
     * @param biome - The biome to measure.
     * @returns Connected chunk count and whether the region extends further.
     */
    private getBiomeRegionSize(chunkX: number, chunkY: number, biome: BiomeSummary): {count: number; isPartial: boolean} {
        const cached = this.biomeRegionCache.get(biome);
        if (cached && this.chunks.has(cached.anchorChunkX, cached.anchorChunkY)) {
            return cached;
        }

        const NEIGHBORS: readonly {dx: number; dy: number}[] = [
            {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
        ];
        const visited = new CoordSet();
        const matched = new CoordSet();
        const queue: {chunkX: number; chunkY: number}[] = [{chunkX, chunkY}];
        visited.add(chunkX, chunkY);
        matched.add(chunkX, chunkY);
        let isPartial = false;

        while (queue.length > 0) {
            const {chunkX: cx, chunkY: cy} = queue.shift() as {chunkX: number; chunkY: number};
            for (const {dx, dy} of NEIGHBORS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (visited.has(nx, ny)) {
                    continue;
                }
                visited.add(nx, ny);
                const neighbor = this.chunks.get(nx, ny);
                if (!neighbor?.isReady()) {
                    isPartial = true;
                    continue;
                }
                if (neighbor.biomeSummary === biome) {
                    matched.add(nx, ny);
                    queue.push({chunkX: nx, chunkY: ny});
                }
            }
        }

        const result = {count: matched.size, isPartial, anchorChunkX: chunkX, anchorChunkY: chunkY};
        this.biomeRegionCache.set(biome, result);
        return result;
    }

    /**
     * Finds the minimum chunk-grid distance to a chunk with a different biome
     * summary, checking only loaded ready chunks. Also returns the approximate
     * compass direction by averaging the displacement vectors of all different-
     * biome chunks found at that minimum distance.
     *
     * @param chunkX - Starting chunk X.
     * @param chunkY - Starting chunk Y.
     * @param biome - The biome to compare against.
     * @returns Distance and direction to the nearest different biome, or `undefined`.
     */
    private getDistanceToBiomeEdge(chunkX: number, chunkY: number, biome: BiomeSummary): {distance: number; direction: string} | undefined {
        const MAX_SEARCH_DISTANCE = 16;
        const visited = new CoordSet();
        visited.add(chunkX, chunkY);
        let currentRing = [{chunkX, chunkY}];

        for (let distance = 1; distance <= MAX_SEARCH_DISTANCE; distance++) {
            const nextRing: {chunkX: number; chunkY: number}[] = [];
            let sumDx = 0;
            let sumDy = 0;
            let foundCount = 0;

            for (const {chunkX: cx, chunkY: cy} of currentRing) {
                for (const {dx, dy} of [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}]) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (visited.has(nx, ny)) {
                        continue;
                    }
                    visited.add(nx, ny);
                    const neighbor = this.chunks.get(nx, ny);
                    if (!neighbor?.isReady()) {
                        continue;
                    }
                    if (neighbor.biomeSummary !== biome && neighbor.biomeSummary !== "" && neighbor.biomeSummary !== "mixed") {
                        sumDx += nx - chunkX;
                        sumDy += ny - chunkY;
                        foundCount++;
                    } else {
                        nextRing.push({chunkX: nx, chunkY: ny});
                    }
                }
            }

            if (foundCount > 0) {
                return {distance, direction: World.toCompassDirection(sumDx / foundCount, sumDy / foundCount)};
            }
            if (nextRing.length === 0) {
                break;
            }
            currentRing = nextRing;
        }
        return undefined;
    }

    /**
     * Maps a displacement vector to one of the eight compass directions.
     * Positive Y is down (screen space), so N is negative Y.
     *
     * @param dx - Horizontal displacement.
     * @param dy - Vertical displacement (positive = south).
     * @returns One of N, NE, E, SE, S, SW, W, NW.
     */
    private static toCompassDirection(dx: number, dy: number): string {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const normalized = (angle + 360) % 360;
        const index = Math.round(normalized / 45) % 8;
        return ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][index];
    }

    /**
     * Looks up the feature tag at the given world tile position, generating
     * its containing chunk first if necessary. Unlike {@link getTile}, safe
     * to call on a chunk that's still generating - returns `"none"` instead
     * of throwing.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The feature tag at that position, or `"none"` if the containing chunk isn't ready yet.
     */
    private getFeatureTag(tileX: number, tileY: number): FeatureTag {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.getChunk(chunkX, chunkY);
        if (!chunk.isReady()) {
            return "none";
        }
        return chunk.getTile(tileX - chunkX * CHUNK_SIZE, tileY - chunkY * CHUNK_SIZE).featureTag;
    }

    /**
     * The most common feature tag among every tile touched by the given
     * pixel rectangle - meant to be called with a sprite's full drawn
     * rectangle (`SpriteFrame.w`/`h`), not its (typically smaller) collision
     * `bounds` polygon, so it reflects what ground the sprite is visually
     * standing on rather than only what its hitbox overlaps.
     *
     * @param x - Left edge of the rectangle, in world pixels.
     * @param y - Top edge of the rectangle, in world pixels.
     * @param w - Rectangle width, in world pixels.
     * @param h - Rectangle height, in world pixels.
     * @returns The most-represented feature tag among the tiles the rectangle overlaps, breaking ties in favour of whichever qualifying tag is encountered first (reading tiles left-to-right, top-to-bottom).
     */
    public getDominantFeatureLabel(x: number, y: number, w: number, h: number): string {
        const startTileX = Math.floor(x / this.tileSize);
        const startTileY = Math.floor(y / this.tileSize);
        const endTileX = Math.floor((x + w - 1) / this.tileSize);
        const endTileY = Math.floor((y + h - 1) / this.tileSize);

        const counts = new Map<string, number>();
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tag = this.getFeatureTag(tileX, tileY);
                if (tag != 'none') {
                    counts.set(tag, (counts.get(tag) ?? 0) + 1);
                }
            }
        }

        let dominantLabel = "none";
        let dominantCount = 0;
        for (const [label, count] of counts) {
            if (count > dominantCount) {
                dominantLabel = label;
                dominantCount = count;
            }
        }
        return dominantLabel;
    }

    /**
     * Looks up the structure sprite(s) at the given world tile position,
     * generating its containing chunk first if necessary. Safe to call on a
     * chunk that's still generating - returns `"none"` instead of throwing.
     * A piece with more than one sprite stacked on it reports them joined with
     * `", "`, so it still reads as one dominance-grouping tag - see
     * {@link getDominantStructureLabel}.
     *
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The structure piece sprite name(s) at that position, or `"none"` if there's no piece there (or the containing chunk isn't ready yet).
     */
    private getStructureTag(tileX: number, tileY: number): string {
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.getChunk(chunkX, chunkY);
        if (!chunk.isReady()) {
            return "none";
        }
        return chunk.getStructurePieceAt(tileX, tileY)?.sprites.join(", ") ?? "none";
    }

    /**
     * The most common structure sprite among every tile touched by the given
     * pixel rectangle - see {@link getDominantFeatureLabel}, which this mirrors.
     *
     * @param x - Left edge of the rectangle, in world pixels.
     * @param y - Top edge of the rectangle, in world pixels.
     * @param w - Rectangle width, in world pixels.
     * @param h - Rectangle height, in world pixels.
     * @returns The most-represented structure sprite among the tiles the rectangle overlaps, breaking ties in favour of whichever qualifying sprite is encountered first (reading tiles left-to-right, top-to-bottom).
     */
    public getDominantStructureLabel(x: number, y: number, w: number, h: number): string {
        const startTileX = Math.floor(x / this.tileSize);
        const startTileY = Math.floor(y / this.tileSize);
        const endTileX = Math.floor((x + w - 1) / this.tileSize);
        const endTileY = Math.floor((y + h - 1) / this.tileSize);

        const counts = new Map<string, number>();
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tag = this.getStructureTag(tileX, tileY);
                if (tag != 'none') {
                    counts.set(tag, (counts.get(tag) ?? 0) + 1);
                }
            }
        }

        let dominantLabel = "none";
        let dominantCount = 0;
        for (const [label, count] of counts) {
            if (count > dominantCount) {
                dominantLabel = label;
                dominantCount = count;
            }
        }
        return dominantLabel;
    }

    /**
     * Every entity currently in the world.
     *
     * @returns The world's entities.
     */
    public getEntities(): readonly Entity[] {
        return this.entities;
    }

    /**
     * The entity currently under player control, e.g. for binding a
     * {@link MovementController} to.
     *
     * @returns The main entity.
     * @throws {TypeError} If {@link setMainEntity} hasn't been called yet.
     */
    public getMainEntity(): MovableEntity {
        return this.requireMainEntity();
    }

    /**
     * Switches which entity is under player control.
     *
     * @param entity - Entity to make the new main entity.
     * @returns `this`, for chaining.
     */
    public setMainEntity(entity: MovableEntity): this {
        if (this.mainEntity) {
            this.destroyEntity(this.mainEntity);
        }
        this.mainEntity = entity;
        this.entities.push(entity);
        return this;
    }

    /**
     * Removes `entity` from the world and clears every effect handler it had
     * registered, so it stops being simulated/drawn and can no longer
     * register new effects into this `World`.
     *
     * @param entity - Entity to remove.
     */
    private destroyEntity(entity: MovableEntity): void {
        entity.effectDispatcher.clear();
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
    }

    /**
     * The current main entity, or throws if {@link setMainEntity} hasn't
     * been called yet - every caller of {@link update}/{@link draw} is
     * expected to have set one up first.
     *
     * @returns The main entity.
     * @throws {TypeError} If no main entity has been set yet.
     */
    private requireMainEntity(): MovableEntity {
        return requireNonNull(this.mainEntity);
    }

    /**
     * Teleports the main entity so its sprite is centred on `target`,
     * bypassing normal movement/collision - for the debug `t` shortcut that
     * teleports the fox to the camera. Works even if `target` falls on a
     * chunk that hasn't finished generating (or doesn't exist) yet - chunk
     * streaming (see {@link updateLoadedChunks}) requests it on the next
     * tick same as anywhere else the camera can see.
     *
     * @param target - World-pixel point to centre the main entity on.
     */
    public teleportMainEntityTo(target: Vector2d): void {
        this.requireMainEntity().teleportTo(target);
    }

    /**
     * Advances every entity in the world by one simulation tick, and streams
     * chunks in/out around the camera (see {@link updateLoadedChunks}). While
     * {@link generationEnabled} is off, entities are constrained inside the
     * currently loaded chunks; while it's on but {@link canMoveOntoGeneratingChunks}
     * is off, they're constrained inside already-generated chunks instead
     * (see {@link constrainEntitiesToChunks}).
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     * @param camera - Camera the world is currently being viewed through.
     * @param spectating - Whether spectator mode is currently active - see {@link getChunkGenerationFocus}.
     */
    public update(deltaMs: number, camera: Camera, spectating: boolean): void {
        this.animationElapsedMs += deltaMs;
        const previousPositions = new Map<MovableEntity, Vector2d>();
        for (const entity of this.entities) {
            if (entity instanceof MovableEntity) {
                previousPositions.set(entity, entity.getPosition());
            }
            entity.update(deltaMs);
        }
        this.updateEffects(deltaMs);
        const focus = this.getChunkGenerationFocus(camera, spectating);
        this.updateLoadedChunks(camera, focus);
        this.reorderChunkGenerationQueueIfFocusMoved(focus);
        if (!this.generationEnabled) {
            this.constrainEntitiesToChunks(previousPositions, () => true);
        } else if (!this.canMoveOntoGeneratingChunks) {
            this.constrainEntitiesToChunks(previousPositions, (chunk) => chunk.isReady());
        }
        this.handleCollisions(previousPositions);
    }

    /**
     * Checks each {@link MovableEntity} against every collidable tile and
     * structure piece it currently overlaps, and reacts to the first one
     * found (see {@link handleEntityCollisions}) per {@link CollisionResponseKind}.
     *
     * @param previousPositions - Each entity's position before this tick's movement - see {@link update}.
     */
    private handleCollisions(previousPositions: ReadonlyMap<MovableEntity, Vector2d>): void {
        for (const entity of this.entities) {
            if (!(entity instanceof MovableEntity)) {
                continue;
            }
            const previousPosition = previousPositions.get(entity);
            if (!previousPosition) {
                continue;
            }
            if (entity.isMoving()) {
                // Clear the stale indicator now that the entity's actually
                // being moved again - handleEntityCollisions immediately
                // below sets it fresh if this move collides too.
                this.lastCollision = undefined;
            }
            this.handleEntityCollisions(entity, previousPosition);
        }
    }

    /**
     * Sweeps every tile `entity`'s bounding rect touches, testing its
     * collision polygon (see {@link Entity.getCollisionPolygon}) against
     * each one's collidable tile (via {@link Tile.getCollision}) and
     * collidable structure piece (via {@link structurePiecePolygon}). Stops
     * at the first overlap found and reacted to - the entity may have just moved,
     * so the remaining precomputed tile range no longer reliably reflects
     * its position; next tick's sweep picks up from wherever it ends up.
     *
     * @param entity - The entity to check.
     * @param previousPosition - `entity`'s position before this tick's movement - see {@link handleCollisions}.
     */
    private handleEntityCollisions(entity: MovableEntity, previousPosition: Vector2d): void {
        const rect = entity.getBoundingRect();
        const startTileX = Math.floor(rect.x / this.tileSize);
        const startTileY = Math.floor(rect.y / this.tileSize);
        const endTileX = Math.floor((rect.x + rect.w - 1) / this.tileSize);
        const endTileY = Math.floor((rect.y + rect.h - 1) / this.tileSize);

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.getReadyTile(tileX, tileY);
                const tileCollision = tile?.getCollision(tileX, tileY, this.tileSize);
                if (tile && tileCollision) {
                    if (this.resolveObstacleCollision(entity, previousPosition, tileCollision.polygon, tileCollision.response, "tile", tile.groundType, tileX, tileY, undefined)) {
                        return;
                    }
                }

                const piece = this.getReadyStructurePieceAt(tileX, tileY);
                if (piece && piece.collision !== "none") {
                    const piecePolygon = this.structurePiecePolygon(piece, tileX, tileY);
                    const structure = this.findStructure(piece.structureId);
                    if (this.resolveObstacleCollision(entity, previousPosition, piecePolygon, piece.collision, "structure", piece.sprites.join(", "), tileX, tileY, structure)) {
                        return;
                    }
                }
            }
        }
    }

    /**
     * `piece`'s collision polygon, in world pixels.
     * Note that only the base sprite is used, ignoring layers on top of it.
     *
     * @param piece - The structure piece to build a collision polygon for.
     * @param tileX - The piece's tile X, in tiles from the world origin.
     * @param tileY - The piece's tile Y, in tiles from the world origin.
     * @returns The piece's world-space collision polygon.
     */
    private structurePiecePolygon(piece: StructurePieceInstance, tileX: number, tileY: number): ConvexPolygon {
        const centerX = tileX * this.tileSize + this.tileSize / 2;
        const centerY = tileY * this.tileSize + this.tileSize / 2;
        return this.structureCollisionPolygonForSprite(piece.sprites[0], centerX, centerY, this.tileSize)
            ?? rectPolygon(tileX * this.tileSize, tileY * this.tileSize, this.tileSize, this.tileSize);
    }

    /**
     * `sprite`'s collision hull, scaled to `tileSize` and centred at
     * `(centerX, centerY)`.
     *
     * @param sprite - The structure/cactus sprite type to look up.
     * @param centerX - Tile centre X to place the polygon at, in canvas pixels.
     * @param centerY - Tile centre Y to place the polygon at, in canvas pixels.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     * @returns The sprite's collision polygon, or `undefined` if it has no authored hull.
     */
    private structureCollisionPolygonForSprite(sprite: string, centerX: number, centerY: number, tileSize: number): ConvexPolygon | undefined {
        const {bounds, w} = this.locateStructureSprite(sprite);
        if (!bounds) {
            return undefined;
        }
        const scale = tileSize / w;
        return bounds.points.map((point) => new Vector2d(centerX + point.x * scale, centerY + point.y * scale));
    }

    /**
     * Locates `sprite` within whichever sheet actually defines it.
     *
     * @param sprite - The structure sprite type to locate.
     * @returns Its located tile, including its collision {@link SpriteBounds} if it has any.
     */
    private locateStructureSprite(sprite: string): SpriteTile {
        return this.structureSheetRegistry.findSheet(sprite).locateTile(sprite);
    }

    /**
     * Looks up the `Structure` (e.g. the shared `TreeStructure`) that
     * produced a piece stamped with `structureId` - see
     * {@link StructurePieceInstance.structureId}. Reads from
     * {@link chunkGenerator}, the main-thread `ChunkGenerator` kept around
     * for exactly this kind of lookup (chunk generation itself runs on
     * {@link chunkWorkerClient}, off-thread).
     *
     * @param structureId - The structure type's id to look up.
     * @returns The matching `Structure`, or `undefined` if none matches (shouldn't normally happen).
     */
    private findStructure(structureId: string): Structure | undefined {
        return this.chunkGenerator.getStructures().find((structure) => structure.getStructureId() === structureId);
    }

    /**
     * Tests `entity`'s *current* collision polygon (re-derived fresh here,
     * since an earlier obstacle this same sweep may have just repositioned
     * it) against `obstaclePolygon`, and on overlap: gives `structure` (if
     * any) first refusal via its optional {@link Structure.handleCollision} -
     * returning `false` from that skips the generic response entirely - then
     * otherwise dispatches `response`'s reaction via {@link applyCollisionResponse}
     * (which also logs - see its doc).
     *
     * @param entity - The entity whose polygon is being tested.
     * @param previousPosition - `entity`'s position before this tick's movement, passed through to the response handler.
     * @param obstaclePolygon - The tile/structure piece's collision polygon.
     * @param response - How to react on overlap - never `"none"`, since callers skip dispatching for it entirely.
     * @param obstacleKind - What kind of obstacle this is (e.g. `"tile"`/`"structure"`), passed through to {@link CollisionContext}.
     * @param obstacleName - The obstacle's own name (e.g. a ground type or structure sprite), passed through to {@link CollisionContext}.
     * @param tileX - The obstacle's tile X, passed through to {@link CollisionContext}.
     * @param tileY - The obstacle's tile Y, passed through to {@link CollisionContext}.
     * @param structure - The `Structure` that produced this obstacle, or `undefined` for a tile (tiles have no `Structure` behind them).
     * @returns `true` if a collision was found (and handled, one way or the other).
     */
    private resolveObstacleCollision(
        entity: MovableEntity,
        previousPosition: Vector2d,
        obstaclePolygon: ConvexPolygon,
        response: Exclude<CollisionResponseKind, "none">,
        obstacleKind: string,
        obstacleName: string,
        tileX: number,
        tileY: number,
        structure: Structure | undefined,
    ): boolean {
        if (!convexPolygonsIntersect(entity.getCollisionPolygon(), obstaclePolygon)) {
            return false;
        }
        this.lastCollision = {
            entityLabel: entity.getDisplayName(),
            obstacleLabel: `${obstacleKind} "${obstacleName}" (${tileX}, ${tileY})`,
        };
        const context: CollisionContext = {entity, previousPosition, obstaclePolygon, obstacleKind, obstacleName, tileX, tileY};
        if (structure?.handleCollision && !structure.handleCollision(context)) {
            return true;
        }
        applyCollisionResponse(response, context);
        return true;
    }

    /**
     * Ages every registered {@link Effect} by `deltaMs`, then drops any that
     * have expired.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    private updateEffects(deltaMs: number): void {
        this.effects.forEach(e => e.update(deltaMs));
        this.effects = this.effects.filter(e => !e.isExpired());
    }

    /**
     * The world-pixel point new chunk requests are prioritised around - the
     * main entity's position normally, or the camera's centre while
     * spectating, since spectating detaches the camera and leaves the main
     * entity stationary.
     *
     * @param camera - Camera to read the spectator position from.
     * @param spectating - Whether spectator mode is currently active.
     * @returns The chunk generation focus point.
     */
    private getChunkGenerationFocus(camera: Camera, spectating: boolean): Vector2d {
        return spectating ? camera.getCenter() : this.requireMainEntity().getPosition();
    }

    /**
     * Re-sorts the worker's still-queued (not yet started) chunk requests by
     * {@link getChunkGenerationPriority}, but only once `focus` has moved
     * into a different chunk since the last call - the relative priority
     * order only changes meaningfully then, so there's no need to re-sort
     * every tick.
     *
     * @param focus - Current chunk generation focus point - see {@link getChunkGenerationFocus}.
     */
    private reorderChunkGenerationQueueIfFocusMoved(focus: Vector2d): void {
        const tileX = Math.floor(focus.x / this.tileSize);
        const tileY = Math.floor(focus.y / this.tileSize);
        const chunk = World.tileToChunk(tileX, tileY);

        if (this.lastChunkGenerationFocusChunk && this.lastChunkGenerationFocusChunk.chunkX === chunk.chunkX && this.lastChunkGenerationFocusChunk.chunkY === chunk.chunkY) {
            return;
        }
        this.lastChunkGenerationFocusChunk = chunk;

        const order = [...this.chunkWorkerClient.getPendingChunks()].sort((a, b) => this.getChunkGenerationPriority(a, focus) - this.getChunkGenerationPriority(b, focus));
        this.chunkWorkerClient.reorderPending(order);
    }

    /**
     * The range of chunk coordinates that overlap the camera's view.
     *
     * @param camera - Camera to compute the visible chunk range for.
     * @returns The visible chunk range.
     */
    private getVisibleChunkRange(camera: Camera): ChunkRange {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        return {
            startChunkX: Math.floor(camera.getViewX() / chunkPixelSize),
            startChunkY: Math.floor(camera.getViewY() / chunkPixelSize),
            endChunkX: Math.floor((camera.getViewX() + camera.getWidth()) / chunkPixelSize),
            endChunkY: Math.floor((camera.getViewY() + camera.getHeight()) / chunkPixelSize),
        };
    }

    /**
     * How urgently a chunk should be generated: lower comes first. Manhattan
     * distance from `focus`, in chunk units - chunks radiate outward from
     * `focus` as a diamond, equally in every direction.
     *
     * @param coordinate - Chunk coordinate to prioritise.
     * @param focus - World-pixel point to prioritise around - see {@link getChunkGenerationFocus}.
     * @returns The priority (lower is more urgent).
     */
    private getChunkGenerationPriority(coordinate: ChunkCoordinate, focus: Vector2d): number {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const dx = (coordinate.chunkX + 0.5) - focus.x / chunkPixelSize;
        const dy = (coordinate.chunkY + 0.5) - focus.y / chunkPixelSize;
        return Math.abs(dx) + Math.abs(dy);
    }

    /**
     * Generates/loads every chunk within the camera's view plus a buffer of
     * {@link CHUNK_BUFFER} chunks, then unloads any loaded chunk that's
     * drifted further than that buffer outside the view. Keeps memory
     * bounded as the camera pans, while still keeping a margin of chunks
     * pre-generated just outside the visible area. A no-op while
     * {@link generationEnabled} is off, freezing the currently loaded chunks
     * as "the map" instead of streaming more in/out.
     *
     * Not-yet-loaded chunks are requested in {@link getChunkGenerationPriority}
     * order. Chunks already queued keep their existing position in the
     * worker's queue.
     *
     * @param camera - Camera to load/unload chunks around.
     * @param focus - Current chunk generation focus point - see {@link getChunkGenerationFocus}.
     */
    private updateLoadedChunks(camera: Camera, focus: Vector2d): void {
        if (!this.generationEnabled) {
            return;
        }

        const visible = this.getVisibleChunkRange(camera);
        const bufferedStartX = visible.startChunkX - World.CHUNK_BUFFER;
        const bufferedStartY = visible.startChunkY - World.CHUNK_BUFFER;
        const bufferedEndX = visible.endChunkX + World.CHUNK_BUFFER;
        const bufferedEndY = visible.endChunkY + World.CHUNK_BUFFER;

        const pending: ChunkCoordinate[] = [];
        for (let chunkY = bufferedStartY; chunkY <= bufferedEndY; chunkY++) {
            for (let chunkX = bufferedStartX; chunkX <= bufferedEndX; chunkX++) {
                if (!this.isChunkLoaded(chunkX, chunkY)) {
                    pending.push({chunkX, chunkY});
                }
            }
        }

        pending.sort((a, b) => this.getChunkGenerationPriority(a, focus) - this.getChunkGenerationPriority(b, focus));
        for (const {chunkX, chunkY} of pending) {
            this.getChunk(chunkX, chunkY);
        }

        for (const chunk of this.chunks.values()) {
            const outsideBuffer = chunk.chunkX < bufferedStartX || chunk.chunkX > bufferedEndX
                || chunk.chunkY < bufferedStartY || chunk.chunkY > bufferedEndY;
            if (outsideBuffer) {
                this.unloadChunk(chunk.chunkX, chunk.chunkY);
            }
        }
    }

    /**
     * Draws every chunk that overlaps the camera's view (loading and caching
     * any of those chunks that aren't already loaded), then every entity
     * whose sprite overlaps it.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     * @param debugEnabled - Whether to draw the debug HUD (the camera/entity readout). Defaults to `false`.
     * @param bordersEnabled - Whether to also draw chunk/tile/biome/feature/structure border outlines. Defaults to `false`.
     * @param hitboxesEnabled - Whether to also draw entity bounding boxes/facing arrows. Defaults to `false`.
     * @param spectating - Whether spectator mode is currently active, shown as an indicator in the debug HUD. Defaults to `false`.
     * @param actualFps - Currently measured rendering FPS, shown in the debug HUD. Defaults to `0`.
     * @param targetFps - Configured FPS cap, shown alongside `actualFps` in the debug HUD, or `undefined` when uncapped.
     * @param noiseFieldName - Name of a registered `NoiseField` to render as a heatmap (with a colour-scale key) over the visible area, or `undefined` for none. Only drawn while `debugEnabled`.
     */
    public draw(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        debugEnabled = false,
        bordersEnabled = false,
        hitboxesEnabled = false,
        spectating = false,
        spectatorVelocity: Vector2d = Vector2d.ZERO,
        actualFps = 0,
        targetFps?: number,
        noiseFieldName?: string,
    ): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        ctx.save();
        ctx.scale(camera.getZoom(), camera.getZoom());
        ctx.imageSmoothingEnabled = false;

        this.lastVisibleChunkCount = 0;
        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;

                if (!this.generationEnabled && !this.isChunkLoaded(chunkX, chunkY)) {
                    ctx.fillStyle = World.VOID_COLOR;
                    ctx.fillRect(originX, originY, chunkPixelSize, chunkPixelSize);
                    continue;
                }

                const chunk = this.getChunk(chunkX, chunkY);
                chunk.draw(ctx, originX, originY, this.tileSize, this.animationElapsedMs);
                this.lastVisibleChunkCount++;
            }
        }

        if (debugEnabled && noiseFieldName) {
            this.drawNoiseFieldOverlay(ctx, camera, noiseFieldName);
        }

        for (const effect of this.effects) {
            effect.draw(ctx, viewX, viewY);
        }
        this.drawEntities(ctx, camera, hitboxesEnabled);
        this.drawStructureProps(ctx, camera);

        if (bordersEnabled) {
            // drawn last, on top of entities/structures alike, so debug
            // annotations are never occluded by a tree or entity
            this.drawChunkDebugOverlays(ctx, camera);
            this.drawBiomeOutlines(ctx, camera);
        }

        ctx.restore();

        if (this.minimapEnabled) {
            this.minimap.draw(ctx, ctx.canvas.width, this.buildMinimapData(debugEnabled, noiseFieldName));
        }

        if (debugEnabled) {
            this.drawDebugHud(ctx, camera, {spectating, spectatorVelocity, actualFps, targetFps});
            if (noiseFieldName) {
                const legendRightEdge = this.minimapEnabled
                    ? Minimap.getLegendRightEdge(ctx.canvas.width)
                    : ctx.canvas.width - DEBUG_CONFIG.noiseLegendMargin;
                this.drawNoiseFieldLegend(ctx, legendRightEdge, noiseFieldName);
            }
        }
    }

    /**
     * Gathers this frame's minimap data: the player's centre position/facing,
     * plus a colour source that switches from biome colour to the selected
     * debug noise field's own gradient while `debugEnabled && noiseFieldName`
     * - the same condition that already gates {@link drawNoiseFieldOverlay}/
     * {@link drawNoiseFieldLegend} - so the minimap never shows a different
     * colour language from the rest of the debug view for the same data.
     *
     * @param debugEnabled - Whether debug mode is currently on.
     * @param noiseFieldName - Name of the currently selected debug noise field, if any.
     * @returns This frame's minimap data - see {@link MinimapData}.
     */
    private buildMinimapData(debugEnabled: boolean, noiseFieldName?: string): MinimapData {
        const mainEntity = this.requireMainEntity();
        const position = mainEntity.getPosition();
        const playerTileX = position.x / this.tileSize;
        const playerTileY = position.y / this.tileSize;
        const facing = mainEntity.getFacingVector();

        if (debugEnabled && noiseFieldName) {
            const gradient = getFieldGradient(noiseFieldName);
            return {
                playerTileX,
                playerTileY,
                facing,
                modeKey: `noise:${noiseFieldName}`,
                sampleColor: (tileX, tileY) => sampleGradient(gradient, this.getNoiseFieldSample(noiseFieldName, tileX, tileY) ?? 0),
            };
        }

        return {
            playerTileX,
            playerTileY,
            facing,
            modeKey: "biome",
            sampleColor: (tileX, tileY) => BIOME_COLORS[this.chunkGenerator.resolveBiomeTagAt(tileX, tileY)],
        };
    }

    /**
     * Draws every loaded visible chunk's foreground-layer structure pieces
     * (e.g. tree trunks/canopies), on top of every entity just drawn by
     * {@link drawEntities} - see {@link Chunk.drawProps}.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     */
    private drawStructureProps(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.getChunk(chunkX, chunkY).drawProps(ctx, originX, originY, this.tileSize);
            }
        }
    }

    /**
     * Draws every loaded visible chunk's debug overlay (outline,
     * coordinate/biome/cache-state label, feature/structure outlines) - see
     * {@link Chunk.drawDebug}. Its own pass, called after entities/structure
     * props rather than folded into {@link draw}'s main per-chunk loop, so
     * debug annotations always sit on top of everything else instead of
     * being covered by a tree or entity drawn afterward.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     */
    private drawChunkDebugOverlays(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                const chunk = this.getChunk(chunkX, chunkY);
                const queuePosition = chunk.isReady() ? undefined : this.chunkWorkerClient.getQueuePosition(chunkX, chunkY);
                chunk.drawDebug(ctx, originX, originY, this.tileSize, queuePosition);
            }
        }
    }

    /** Draws each visible edge whose neighbouring tiles have different biome tags. */
    private drawBiomeOutlines(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const startTileX = Math.floor(viewX / this.tileSize);
        const startTileY = Math.floor(viewY / this.tileSize);
        const endTileX = Math.floor((viewX + camera.getWidth() - 1) / this.tileSize);
        const endTileY = Math.floor((viewY + camera.getHeight() - 1) / this.tileSize);

        ctx.strokeStyle = DEBUG_CONFIG.biomeOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.biomeOutlineWidth;
        ctx.beginPath();
        let hasBoundary = false;

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.getReadyTile(tileX, tileY);
                if (!tile) {
                    continue;
                }

                const left = tileX * this.tileSize - viewX;
                const top = tileY * this.tileSize - viewY;
                const right = left + this.tileSize;
                const bottom = top + this.tileSize;
                const rightTile = this.getReadyTile(tileX + 1, tileY);
                if (rightTile && rightTile.biomeTag !== tile.biomeTag) {
                    ctx.moveTo(right, top);
                    ctx.lineTo(right, bottom);
                    hasBoundary = true;
                }

                const bottomTile = this.getReadyTile(tileX, tileY + 1);
                if (bottomTile && bottomTile.biomeTag !== tile.biomeTag) {
                    ctx.moveTo(left, bottom);
                    ctx.lineTo(right, bottom);
                    hasBoundary = true;
                }
            }
        }

        if (hasBoundary) {
            ctx.stroke();
        }
    }

    /**
     * Every registered `NoiseField`'s name.
     *
     * @returns Every registered field name.
     */
    public getNoiseFieldNames(): readonly string[] {
        return this.chunkGenerator.getFields().getAll().map((field) => field.name);
    }

    /**
     * Samples one registered `NoiseField` at a world tile position.
     *
     * @param fieldName - Name of the field to sample.
     * @param tileX - Tile's X position, in tiles from the world origin.
     * @param tileY - Tile's Y position, in tiles from the world origin.
     * @returns The field's sample at that position, or `undefined` if nothing is registered under `fieldName`.
     */
    public getNoiseFieldSample(fieldName: string, tileX: number, tileY: number): number | undefined {
        return this.chunkGenerator.getFields().get(fieldName)?.sample(tileX, tileY);
    }

    /**
     * Renders one registered `NoiseField` as a heatmap, using its themed
     * colour gradient (see `noise-field-colors.ts`) if it has one, or
     * greyscale (black = 0, white = close to 1) otherwise.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera whose view to cover.
     * @param fieldName - Name of the field to render; a no-op if nothing is registered under that name.
     */
    private drawNoiseFieldOverlay(ctx: CanvasRenderingContext2D, camera: Camera, fieldName: string): void {
        const field = this.chunkGenerator.getFields().get(fieldName);
        if (!field) {
            return;
        }

        const gradient = getFieldGradient(fieldName);
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = this.getVisibleChunkRange(camera);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.getChunk(chunkX, chunkY).drawNoiseOverlay(ctx, originX, originY, this.tileSize, field, gradient);
            }
        }
    }

    /**
     * Draws a vertical colour-scale key for the currently visualised noise
     * field in the canvas's top-right corner: a bar spanning the field's
     * gradient (see {@link drawNoiseFieldOverlay}) from `1` at the top to
     * `0` at the bottom, with tick labels at 0, 0.25, 0.5, 0.75, and 1.
     *
     * @param ctx - Canvas context to draw into, already outside any camera transform.
     * @param rightEdge - Where the legend's right edge should sit, in canvas pixels - immediately left of the
     * minimap when it's also showing this frame, or the canvas's own right margin otherwise (see `World.draw`).
     * @param fieldName - Name of the currently visualised field.
     */
    private drawNoiseFieldLegend(ctx: CanvasRenderingContext2D, rightEdge: number, fieldName: string): void {
        const {
            noiseLegendBarWidth: barWidth,
            noiseLegendBarHeight: barHeight,
            noiseLegendMargin: margin,
            noiseLegendPadding: padding,
            noiseLegendTickLength: tickLength,
            noiseLegendLabelGap: labelGap,
        } = DEBUG_CONFIG;
        const ticks: {value: number; label: string}[] = [
            {value: 1, label: "MAX (1)"},
            {value: 0.75, label: "0.75"},
            {value: 0.5, label: "0.5"},
            {value: 0.25, label: "0.25"},
            {value: 0, label: "MIN (0)"},
        ];

        ctx.font = DEBUG_CONFIG.noiseLegendFont;
        const labelWidth = Math.max(...ticks.map((tick) => ctx.measureText(tick.label).width));

        const boxWidth = padding * 2 + barWidth + tickLength + labelGap + labelWidth;
        const boxHeight = padding * 2 + barHeight;
        const boxLeft = rightEdge - boxWidth;
        const boxTop = margin;
        const barLeft = boxLeft + padding;
        const barTop = boxTop + padding;

        ctx.fillStyle = DEBUG_CONFIG.noiseLegendBackgroundColor;
        ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);

        const gradient = ctx.createLinearGradient(barLeft, barTop, barLeft, barTop + barHeight);
        for (const stop of getFieldGradient(fieldName)) {
            const [r, g, b] = stop.rgb;
            gradient.addColorStop(1 - stop.value, `rgb(${r}, ${g}, ${b})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(barLeft, barTop, barWidth, barHeight);

        ctx.strokeStyle = DEBUG_CONFIG.noiseLegendLineColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(barLeft + 0.5, barTop + 0.5, barWidth - 1, barHeight - 1);

        ctx.fillStyle = DEBUG_CONFIG.noiseLegendTextColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        for (const tick of ticks) {
            const y = barTop + (1 - tick.value) * barHeight;
            ctx.beginPath();
            ctx.moveTo(barLeft + barWidth, y);
            ctx.lineTo(barLeft + barWidth + tickLength, y);
            ctx.stroke();
            ctx.fillText(tick.label, barLeft + barWidth + tickLength + labelGap, y);
        }
    }

    /**
     * Draws every entity whose sprite overlaps the camera's view. Entities
     * entirely outside the view are skipped.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render entities through.
     * @param hitboxesEnabled - Whether to draw each entity's bounding box/facing arrow.
     */
    private drawEntities(ctx: CanvasRenderingContext2D, camera: Camera, hitboxesEnabled = false): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();

        for (const entity of this.entities) {
            const bitmap = entity.getCurrentBitmap();
            if (!bitmap) {
                continue;
            }

            const rect = entity.getBoundingRect();
            if (!camera.isRectVisible(rect)) {
                continue;
            }

            const frame = entity.getCurrentFrame();
            if (frame.rotation) {
                const position = entity.getPosition();
                ctx.save();
                ctx.translate(position.x - viewX, position.y - viewY);
                ctx.rotate(frame.rotation);
                ctx.drawImage(bitmap, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
                if (hitboxesEnabled) {
                    entity.drawDebugOverlay(ctx, viewX, viewY);
                }
                ctx.restore();
            } else {
                ctx.drawImage(bitmap, rect.x - viewX, rect.y - viewY, rect.w, rect.h);
                if (hitboxesEnabled) {
                    entity.drawDebugOverlay(ctx, viewX, viewY);
                }
            }
        }
    }

    /**
     * Draws a top-left HUD showing the camera's centre point and viewport
     * size, plus the main entity's position and current speed (or, while
     * spectating, the camera's pan speed instead), plus the current/target
     * FPS, plus a spectator-mode indicator when active.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to read position/viewport info from.
     * @param options - Remaining data the HUD needs - see {@link DebugHudOptions}.
     */
    private drawDebugHud(ctx: CanvasRenderingContext2D, camera: Camera, options: DebugHudOptions): void {
        const {spectating, spectatorVelocity, actualFps, targetFps} = options;
        const mainEntity = this.requireMainEntity();
        const center = camera.getCenter();
        const position = mainEntity.getPosition();
        const velocity = spectating ? spectatorVelocity : mainEntity.getVelocity();
        const velocityLabel = spectating ? "Spectator" : mainEntity.getDisplayName();
        const speed = Math.hypot(velocity.x, velocity.y);
        const tileX = Math.floor(position.x / this.tileSize);
        const tileY = Math.floor(position.y / this.tileSize);
        const {chunkX, chunkY} = World.tileToChunk(tileX, tileY);
        const chunk = this.getChunk(chunkX, chunkY);
        const chunkBiome = chunk.isReady() ? chunk.biomeSummary : "generating...";
        const chunkCacheState = chunk.isReady() ? chunk.getCacheState() : "pending";
        const biomeRegion = chunk.isReady() && chunk.biomeSummary !== "" && chunk.biomeSummary !== "mixed"
            ? this.getBiomeRegionSize(chunkX, chunkY, chunk.biomeSummary)
            : undefined;
        const exactFeature = this.getFeatureTag(tileX, tileY);
        const rect = mainEntity.getBoundingRect();
        const nearbyFeature = this.getDominantFeatureLabel(rect.x, rect.y, rect.w, rect.h);
        const exactStructure = this.getStructureTag(tileX, tileY);
        const nearbyStructure = this.getDominantStructureLabel(rect.x, rect.y, rect.w, rect.h);

        const distanceToBiomeEdge = chunk.isReady() && chunk.biomeSummary !== "" && chunk.biomeSummary !== "mixed"
            ? this.getDistanceToBiomeEdge(chunkX, chunkY, chunk.biomeSummary)
            : undefined;

        const toChunkState = (cx: number, cy: number): ChunkState => {
            const c = this.chunks.get(cx, cy);
            if (!c) return "unloaded";
            return c.isReady() ? "ready" : "generating";
        };
        const neighborStates = {
            n: toChunkState(chunkX, chunkY - 1),
            s: toChunkState(chunkX, chunkY + 1),
            e: toChunkState(chunkX + 1, chunkY),
            w: toChunkState(chunkX - 1, chunkY),
        };

        this.debugHud.draw(ctx, {
            cameraCenterX: center.x,
            cameraCenterY: center.y,
            viewportWidth: camera.getWidth(),
            viewportHeight: camera.getHeight(),
            zoom: camera.getZoom(),
            entityX: position.x,
            entityY: position.y,
            entityFacing: mainEntity.getFacing(),
            tileX,
            tileY,
            chunkX,
            chunkY,
            chunkBiome,
            chunkCacheState,
            neighborStates,
            distanceToBiomeEdge,
            biomeRegionChunks: biomeRegion?.count,
            biomeRegionIsPartial: biomeRegion?.isPartial ?? false,
            visibleChunkCount: this.lastVisibleChunkCount,
            loadedChunkCount: this.getLoadedChunkCount(),
            generatingChunkCount: this.getGeneratingChunkCount(),
            latestChunkGenerationTimeMs: this.getLatestChunkGenerationTimeMs(),
            averageChunkGenerationTimeMs: this.getAverageChunkGenerationTimeMs(),
            exactFeature,
            nearbyFeature,
            exactStructure,
            nearbyStructure,
            velocityLabel,
            velocityX: velocity.x,
            velocityY: velocity.y,
            speed,
            actualFps,
            targetFps,
            spectating,
            collision: this.lastCollision !== undefined,
            collisionEntity: this.lastCollision?.entityLabel ?? "",
            collisionObstacle: this.lastCollision?.obstacleLabel ?? "",
        });
    }
}
