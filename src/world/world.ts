import type {Chunk, ChunkSpriteSheets, DrawableChunk} from "./chunks/chunk";
import {CHUNK_SIZE} from "./chunks/chunk";
import {
    bufferChunkRange,
    chunkGenerationPriority,
    coordinatesInRange,
    DEFAULT_CHUNK_BUFFER,
    isOutsideChunkRange,
    visibleChunkRange,
} from "./chunks/chunk-streaming-math";
import {DefaultWorldGridView} from "./tiles/world-grid-view";
import {Entity} from "../entities/entity";
import {MovableEntity} from "../entities/movable-entity";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {DebugHudRenderer} from "../debug/debug-hud";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {FeatureTag} from "./generation/feature/feature-tag";
import {SpriteFrame, SpriteTile} from "../sprites/sprite";
import {CoordMap} from "./coordinates/coord-set";
import {Effect} from "../effects/effect";
import {requireNonNull} from "../util";
import {getFieldGradient} from "./generation/noise-field-colors";
import {Minimap, MinimapRenderer} from "../minimap/minimap";
import {MinimapStatsHudRenderer} from "../minimap/minimap-stats-hud";
import {Structure, StructurePieceInstance} from "./generation/structure/structure";
import {ConvexPolygon, convexPolygonsIntersect, rectPolygon} from "../geometry/convex-polygon";
import {CollisionResponseKind} from "../geometry/collision-response";
import {applyCollisionResponse, CollisionContext} from "./collision/collision";
import {EntityHoverInfo, MinimapHoverInfo, TileHoverInfo} from "./inspection/hover-info";
import {ChunkCoordinate} from "./coordinates/chunk-coordinate";
import {pixelRectToTileRange, tileToChunk} from "./coordinates/world-grid-math";
import {randomWorldSeed} from "./generation/random-world-seed";
import type {ChunkGenerationWorker} from "./generation/chunk/chunk-generation-worker";
import type {StructureSheetRegistry} from "./rendering/structure-sheet-dispatch";
import type {ChunkFactory, WorldDependencies} from "./world-dependencies";
import {WorldEffects} from "./effects/world-effects";
import {WorldGenerationView} from "./generation/world-generation-view";
import {MinimapDataBuilder} from "./inspection/minimap-data-builder";
import {WorldHoverInspector} from "./inspection/world-hover-inspector";
import {WorldDebugSnapshotBuilder} from "./inspection/world-debug-snapshot-builder";

/**
 * The game world: an effectively infinite 2D grid of tiles, split into
 * fixed-size {@link Chunk}s that are generated on demand and cached in
 * memory as they're needed.
 */
export class World {
    /** Fill colour for the "void" - camera-visible area outside every loaded chunk. */
    private static readonly VOID_COLOR = "#000000";

    private readonly chunks = new CoordMap<DrawableChunk>();
    private readonly entities: Entity[] = [];

    /** Routes a structure piece's sprite string to whichever biome sheet actually defines it. */
    private readonly structureSheetRegistry: StructureSheetRegistry;
    private readonly chunkSpriteSheets: ChunkSpriteSheets;
    private readonly chunkFactory: ChunkFactory;
    private readonly worldGrid: DefaultWorldGridView<DrawableChunk>;

    /** Total elapsed time on the shared clock animated background tiles read their phase from. Advanced every {@link update}. */
    private animationElapsedMs = 0;
    private readonly generationView: WorldGenerationView;
    private readonly chunkWorkerClient: ChunkGenerationWorker;
    private worldSeed: number;
    /** Debug knob: minimum time the worker leaves between chunks. `0` disables it. */
    private minChunkGenerationDelayMs = 0;
    private readonly debugHud: DebugHudRenderer;
    private readonly minimap: MinimapRenderer;
    private readonly minimapStatsHud: MinimapStatsHudRenderer;

    /** Whether the minimap is currently shown. */
    private minimapEnabled = true;

    private readonly worldEffects: WorldEffects;
    private readonly minimapBuilder: MinimapDataBuilder;
    private readonly hoverInspector: WorldHoverInspector;
    private readonly debugSnapshotBuilder: WorldDebugSnapshotBuilder;

    /**
     * The entity currently under player control - `undefined` until
     * {@link setMainEntity} is called at least once.
     */
    private mainEntity: MovableEntity | undefined;

    /**
     * Most recent collision pair for the debug HUD indicator. Stays set until
     * the colliding entity moves again - see {@link handleCollisions}.
     */
    private lastCollision: {entityLabel: string; obstacleLabel: string} | undefined;

    /** Sum of every generated chunk's {@link Chunk.generationTimeMs}. */
    private totalChunkGenerationTimeMs = 0;
    /** Count of chunks contributing to {@link totalChunkGenerationTimeMs}. */
    private generatedChunkCount = 0;
    /** {@link Chunk.generationTimeMs} of the most recently generated chunk. */
    private latestChunkGenerationTimeMs = 0;
    /** Chunk count the last {@link draw} call rendered. */
    private lastVisibleChunkCount = 0;

    /** Chunk {@link getChunkGenerationFocus} was in as of the last {@link reorderChunkGenerationQueueIfFocusMoved} call. */
    private lastChunkGenerationFocusChunk: ChunkCoordinate | undefined;

    /** Whether new chunks may be generated. */
    private generationEnabled = true;

    /**
     * Whether entities may move onto a chunk that hasn't finished generating
     * yet. `false` by default - see {@link constrainEntitiesToChunks}.
     */
    private canMoveOntoGeneratingChunks = false;

    public constructor(public readonly tileSize: number, dependencies: WorldDependencies) {
        this.worldSeed = dependencies.worldSeed;
        this.generationView = new WorldGenerationView(dependencies.chunkGenerator);
        this.chunkWorkerClient = dependencies.chunkWorkerClient;
        this.chunkFactory = dependencies.chunkFactory;
        this.structureSheetRegistry = dependencies.structureSheetRegistry;
        this.chunkSpriteSheets = dependencies.chunkSpriteSheetsFactory(
            this.structureSheetRegistry,
            this.structureCollisionPolygonForSprite.bind(this),
        );
        this.worldGrid = new DefaultWorldGridView<DrawableChunk>(
            this.requestChunk.bind(this),
            (chunkX, chunkY) => this.chunks.get(chunkX, chunkY),
        );
        this.worldEffects = new WorldEffects();
        this.minimapBuilder = new MinimapDataBuilder(tileSize, this.generationView, () => this.requireMainEntity());
        this.hoverInspector = new WorldHoverInspector(tileSize, this.worldGrid, this.generationView, () => this.entities);
        this.debugSnapshotBuilder = new WorldDebugSnapshotBuilder(tileSize, this.worldGrid, this.worldGrid);
        this.debugHud = dependencies.debugHud;
        this.minimap = dependencies.minimap;
        this.minimapStatsHud = dependencies.minimapStatsHud;
    }

    /** Adds `effect` to the active set; it will be advanced and drawn until it expires. */
    public registerEffect(effect: Effect): void {
        this.worldEffects.register(effect);
    }

    /** The seed currently used to generate new chunks. */
    public getWorldSeed(): number {
        return this.worldSeed;
    }

    /**
     * Changes the seed used for new chunks. Already-loaded chunks are kept;
     * only future generation uses `seed`.
     */
    public setWorldSeed(seed: number): void {
        this.worldSeed = seed;
        this.generationView.setSeed(seed);
        this.chunkWorkerClient.setSeed(seed);
        this.debugSnapshotBuilder.clearBiomeRegionCache();
    }

    /** Replaces the world seed with a fresh random one - see {@link setWorldSeed}. */
    public refreshWorldSeed(): void {
        this.setWorldSeed(randomWorldSeed());
    }

    /**
     * Minimum time the worker leaves between chunks, in ms. `0` means disabled.
     * See {@link setMinChunkGenerationDelayMs}.
     */
    public getMinChunkGenerationDelayMs(): number {
        return this.minChunkGenerationDelayMs;
    }

    /**
     * Sets the minimum-delay-between-chunks debug knob.
     * Takes effect immediately and persists across seed changes.
     */
    public setMinChunkGenerationDelayMs(delayMs: number): void {
        this.minChunkGenerationDelayMs = delayMs;
        this.chunkWorkerClient.setMinGenerationDelayMs(delayMs);
    }

    /** Returns the chunk at the given coordinate, requesting generation if it isn't loaded yet. */
    private requestChunk(chunkX: number, chunkY: number): DrawableChunk {
        let chunk = this.chunks.get(chunkX, chunkY);
        if (!chunk) {
            const generation = this.chunkWorkerClient.requestChunk(chunkX, chunkY);
            chunk = this.chunkFactory(chunkX, chunkY, generation, this.chunkSpriteSheets, this.tileSize);
            this.chunks.set(chunkX, chunkY, chunk);
            generation
                .then((result) => {
                    this.latestChunkGenerationTimeMs = result.generationTimeMs;
                    this.totalChunkGenerationTimeMs += result.generationTimeMs;
                    this.generatedChunkCount++;
                })
                .catch(() => {
                    // Worker terminated before this chunk finished; don't count it.
                });
        }
        return chunk;
    }

    /** How many chunks are currently loaded in memory. */
    public getLoadedChunkCount(): number {
        return this.chunks.size;
    }

    /** The worker client driving chunk generation - for console debugging. */
    public getChunkWorkerClient(): ChunkGenerationWorker {
        return this.chunkWorkerClient;
    }

    /** How many currently loaded chunks are still generating. */
    public getGeneratingChunkCount(): number {
        let count = 0;
        for (const chunk of this.chunks.values()) {
            if (!chunk.isReady()) {
                count++;
            }
        }
        return count;
    }

    /** Mean generation time across every chunk generated this session, in ms. */
    public getAverageChunkGenerationTimeMs(): number {
        return this.generatedChunkCount === 0 ? 0 : this.totalChunkGenerationTimeMs / this.generatedChunkCount;
    }

    /** Generation time of the most recently finished chunk, in ms. */
    public getLatestChunkGenerationTimeMs(): number {
        return this.latestChunkGenerationTimeMs;
    }

    /** Drops a chunk from memory. Safe to call when the chunk is not loaded. */
    public unloadChunk(chunkX: number, chunkY: number): void {
        this.chunks.delete(chunkX, chunkY);
    }

    /** Drops every loaded chunk and cancels any pending generation requests. */
    public reloadAllChunks(): void {
        this.chunkWorkerClient.cancelPending();
        this.chunks.clear();
    }

    /** Whether new chunks may currently be generated. */
    public isGenerationEnabled(): boolean {
        return this.generationEnabled;
    }

    /**
     * Enables or disables chunk generation. Disabling also clears the pending
     * generation queue.
     */
    public setGenerationEnabled(enabled: boolean): void {
        this.generationEnabled = enabled;
        if (!enabled) {
            this.cancelPendingChunkGeneration();
        }
    }

    /** Whether the minimap is currently shown. */
    public getMinimapEnabled(): boolean {
        return this.minimapEnabled;
    }

    /**
     * Shows or hides the minimap. Independent of the debug overlay toggle.
     * Re-enabling is handled transparently by `Minimap`'s own stale-centre
     * fallback.
     */
    public setMinimapEnabled(enabled: boolean): void {
        this.minimapEnabled = enabled;
    }

    /** Cancels all pending chunk requests and drops any not-yet-ready chunks. */
    private cancelPendingChunkGeneration(): void {
        this.chunkWorkerClient.cancelPending();
        const toDelete = [...this.chunks.values()].filter(c => !c.isReady());
        for (const chunk of toDelete) {
            this.chunks.delete(chunk.getChunkX(), chunk.getChunkY());
        }
    }

    /** Enables or disables movement onto still-generating chunks. */
    public setCanMoveOntoGeneratingChunks(canMove: boolean): void {
        this.canMoveOntoGeneratingChunks = canMove;
    }

    /**
     * Whether every chunk overlapped by a `frame`-sized rectangle at `position`
     * is both loaded and satisfies `predicate`.
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

    /** Slides or pushes back every {@link MovableEntity} that ended the tick on invalid ground. */
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

    /** Returns hover data for the tile at a world tile position, or `undefined` while its chunk is unready. */
    public getTileHoverInfo(tileX: number, tileY: number): TileHoverInfo | undefined {
        return this.hoverInspector.getTileHoverInfo(tileX, tileY, this.animationElapsedMs);
    }

    /** Returns hover data for the minimap region under a screen point, or `undefined`. */
    public getMinimapHoverInfo(screenX: number, screenY: number, canvasWidth: number): MinimapHoverInfo | undefined {
        return this.hoverInspector.getMinimapHoverInfo(screenX, screenY, canvasWidth);
    }

    /** Returns hover data for the topmost entity at a world-pixel point, or `undefined`. */
    public getEntityHoverInfo(worldX: number, worldY: number): EntityHoverInfo | undefined {
        return this.hoverInspector.getEntityHoverInfo(worldX, worldY);
    }

    /**
     * The most common feature tag across a pixel rectangle. Breaking ties in
     * favour of the first qualifying tag encountered (left-to-right, top-to-bottom).
     */
    public getDominantFeatureLabel(x: number, y: number, w: number, h: number): FeatureTag {
        return this.debugSnapshotBuilder.dominantFeatureLabel(x, y, w, h);
    }

    /**
     * The most common structure sprite across a pixel rectangle. Tie-breaking
     * mirrors {@link getDominantFeatureLabel}.
     */
    public getDominantStructureLabel(x: number, y: number, w: number, h: number): string {
        return this.debugSnapshotBuilder.dominantStructureLabel(x, y, w, h);
    }

    /** Every entity currently in the world. */
    public getEntities(): readonly Entity[] {
        return this.entities;
    }

    /** The entity currently under player control. Throws if none has been set. */
    public getMainEntity(): MovableEntity {
        return this.requireMainEntity();
    }

    /**
     * Switches which entity is under player control.
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

    /** Removes `entity` and clears its effect dispatcher. */
    private destroyEntity(entity: MovableEntity): void {
        entity.effectDispatcher.clear();
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
    }

    /** Returns the main entity, throwing if none has been set. */
    private requireMainEntity(): MovableEntity {
        return requireNonNull(this.mainEntity);
    }

    /**
     * Teleports the main entity so its sprite centre lands on `target`,
     * bypassing collision. Works on any world position regardless of chunk state.
     */
    public teleportMainEntityTo(target: Vector2d): void {
        this.requireMainEntity().teleportTo(target);
    }

    /** Advances entities, effects, chunk streaming, and collision for one tick. */
    public update(deltaMs: number, camera: Camera, spectating: boolean): void {
        this.animationElapsedMs += deltaMs;
        const previousPositions = new Map<MovableEntity, Vector2d>();
        for (const entity of this.entities) {
            if (entity instanceof MovableEntity) {
                previousPositions.set(entity, entity.getPosition());
            }
            entity.update(deltaMs);
        }
        this.worldEffects.update(deltaMs);
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

    /** Sweeps each movable entity against collidable tiles and structure pieces. */
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
                this.lastCollision = undefined;
            }
            this.handleEntityCollisions(entity, previousPosition);
        }
    }

    /** Tests `entity` against every tile and structure piece in its bounding rect, stopping at the first handled collision. */
    private handleEntityCollisions(entity: MovableEntity, previousPosition: Vector2d): void {
        const rect = entity.getBoundingRect();
        const {startTileX, startTileY, endTileX, endTileY} = pixelRectToTileRange(rect.x, rect.y, rect.w, rect.h, this.tileSize);

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.worldGrid.getReadyTile(tileX, tileY);
                const tileCollision = tile?.getCollision(tileX, tileY, this.tileSize);
                if (tile && tileCollision) {
                    if (this.resolveObstacleCollision(entity, previousPosition, tileCollision.polygon, tileCollision.response, "tile", tile.groundType, tileX, tileY, undefined)) {
                        return;
                    }
                }

                const piece = this.worldGrid.getReadyStructurePieceAt(tileX, tileY);
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

    /** Returns `piece`'s world-space collision polygon centred at its tile. */
    private structurePiecePolygon(piece: StructurePieceInstance, tileX: number, tileY: number): ConvexPolygon {
        const centerX = tileX * this.tileSize + this.tileSize / 2;
        const centerY = tileY * this.tileSize + this.tileSize / 2;
        return this.structureCollisionPolygonForSprite(piece.sprites[0], centerX, centerY, this.tileSize)
            ?? rectPolygon(tileX * this.tileSize, tileY * this.tileSize, this.tileSize, this.tileSize);
    }

    /** Returns `sprite`'s authored collision hull scaled to `tileSize`, or `undefined` if it has none. */
    private structureCollisionPolygonForSprite(sprite: string, centerX: number, centerY: number, tileSize: number): ConvexPolygon | undefined {
        const {bounds, w} = this.locateStructureSprite(sprite);
        if (!bounds) {
            return undefined;
        }
        const scale = tileSize / w;
        return bounds.points.map((point) => new Vector2d(centerX + point.x * scale, centerY + point.y * scale));
    }

    /** Locates `sprite` in the sheet that defines it. */
    private locateStructureSprite(sprite: string): SpriteTile {
        return this.structureSheetRegistry.findSheet(sprite).locateTile(sprite);
    }

    /** Finds the {@link Structure} that produced pieces stamped with `structureId`. */
    private findStructure(structureId: string): Structure | undefined {
        return this.generationView.getStructures().find((structure) => structure.getStructureId() === structureId);
    }

    /**
     * Tests `entity`'s current polygon against `obstaclePolygon` and on overlap
     * gives `structure` first refusal, then applies `response` generically.
     * Returns `true` if a collision was found and handled.
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

    /** Returns the world-pixel point new chunk requests are prioritised around. */
    private getChunkGenerationFocus(camera: Camera, spectating: boolean): Vector2d {
        return spectating ? camera.getCenter() : this.requireMainEntity().getPosition();
    }

    /**
     * Re-sorts the worker's pending queue by generation priority, but only
     * when `focus` has crossed a chunk boundary since the last call.
     */
    private reorderChunkGenerationQueueIfFocusMoved(focus: Vector2d): void {
        const tileX = Math.floor(focus.x / this.tileSize);
        const tileY = Math.floor(focus.y / this.tileSize);
        const chunk = tileToChunk(tileX, tileY);
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;

        if (this.lastChunkGenerationFocusChunk && this.lastChunkGenerationFocusChunk.chunkX === chunk.chunkX && this.lastChunkGenerationFocusChunk.chunkY === chunk.chunkY) {
            return;
        }
        this.lastChunkGenerationFocusChunk = chunk;

        const order = [...this.chunkWorkerClient.getPendingChunks()].sort((a, b) =>
            chunkGenerationPriority(a, focus.x, focus.y, chunkPixelSize)
            - chunkGenerationPriority(b, focus.x, focus.y, chunkPixelSize)
        );
        this.chunkWorkerClient.reorderPending(order);
    }

    /**
     * Loads/generates chunks within the camera view plus a buffer, and evicts
     * any that have drifted beyond it. A no-op while generation is disabled.
     */
    private updateLoadedChunks(camera: Camera, focus: Vector2d): void {
        if (!this.generationEnabled) {
            return;
        }

        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const visible = visibleChunkRange(camera.getViewX(), camera.getViewY(), camera.getWidth(), camera.getHeight(), chunkPixelSize);
        const buffered = bufferChunkRange(visible, DEFAULT_CHUNK_BUFFER);
        const pending = [...coordinatesInRange(buffered)].filter(({chunkX, chunkY}) => !this.worldGrid.isChunkLoaded(chunkX, chunkY));

        pending.sort((a, b) =>
            chunkGenerationPriority(a, focus.x, focus.y, chunkPixelSize)
            - chunkGenerationPriority(b, focus.x, focus.y, chunkPixelSize)
        );
        for (const {chunkX, chunkY} of pending) {
            this.worldGrid.requestChunk(chunkX, chunkY);
        }

        for (const chunk of this.chunks.values()) {
            const chunkX = chunk.getChunkX();
            const chunkY = chunk.getChunkY();
            if (isOutsideChunkRange(chunkX, chunkY, buffered)) {
                this.unloadChunk(chunkX, chunkY);
            }
        }
    }

    /** Renders the world: chunks, noise overlay, effects, entities, foreground props, debug, minimap, and HUDs. */
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
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        ctx.save();
        ctx.scale(camera.getZoom(), camera.getZoom());
        ctx.imageSmoothingEnabled = false;

        this.lastVisibleChunkCount = 0;
        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;

                if (!this.generationEnabled && !this.worldGrid.isChunkLoaded(chunkX, chunkY)) {
                    ctx.fillStyle = World.VOID_COLOR;
                    ctx.fillRect(originX, originY, chunkPixelSize, chunkPixelSize);
                    continue;
                }

                const chunk = this.worldGrid.requestChunk(chunkX, chunkY);
                chunk.draw(ctx, originX, originY, this.tileSize, this.animationElapsedMs);
                this.lastVisibleChunkCount++;
            }
        }

        if (debugEnabled && noiseFieldName) {
            this.drawNoiseFieldOverlay(ctx, camera, noiseFieldName);
        }

        this.worldEffects.draw(ctx, viewX, viewY);
        this.drawEntities(ctx, camera, hitboxesEnabled);
        this.drawStructureProps(ctx, camera);

        if (bordersEnabled) {
            // drawn last, on top of entities/structures alike, so debug
            // annotations are never occluded by a tree or entity
            this.drawChunkDebugOverlays(ctx, camera);
            this.drawBiomeOutlines(ctx, camera);
        }

        ctx.restore();

        let minimapData = undefined;
        if (this.minimapEnabled) {
            const center = spectating ? camera.getCenter() : this.requireMainEntity().getPosition();
            minimapData = this.minimapBuilder.build(center, spectating, camera, debugEnabled, noiseFieldName);
            this.minimap.draw(ctx, ctx.canvas.width, minimapData);
        }
        this.hoverInspector.setLastMinimapData(minimapData);

        if (debugEnabled) {
            const debugData = this.debugSnapshotBuilder.build(
                camera,
                this.requireMainEntity(),
                {spectating, spectatorVelocity, actualFps, targetFps},
                this.lastVisibleChunkCount,
                this.getLoadedChunkCount(),
                this.getGeneratingChunkCount(),
                this.getLatestChunkGenerationTimeMs(),
                this.getAverageChunkGenerationTimeMs(),
                this.lastCollision,
            );
            this.debugHud.draw(ctx, debugData);
            if (noiseFieldName) {
                const legendRightEdge = this.minimapEnabled
                    ? Minimap.getLegendRightEdge(ctx.canvas.width)
                    : ctx.canvas.width - DEBUG_CONFIG.noiseLegendMargin;
                this.drawNoiseFieldLegend(ctx, legendRightEdge, noiseFieldName);
            }
            if (minimapData) {
                this.minimapStatsHud.draw(ctx, ctx.canvas.width, this.minimapBuilder.buildStats(minimapData));
            }
        }
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
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.worldGrid.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.worldGrid.requestChunk(chunkX, chunkY).drawProps(ctx, originX, originY, this.tileSize);
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
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.worldGrid.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                const chunk = this.worldGrid.requestChunk(chunkX, chunkY);
                const queuePosition = chunk.isReady() ? undefined : this.chunkWorkerClient.getQueuePosition(chunkX, chunkY);
                chunk.drawDebug(ctx, originX, originY, this.tileSize, queuePosition);
            }
        }
    }

    /** Draws each visible edge whose neighbouring tiles have different biome tags. */
    private drawBiomeOutlines(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const {startTileX, startTileY, endTileX, endTileY} = pixelRectToTileRange(viewX, viewY, camera.getWidth(), camera.getHeight(), this.tileSize);

        ctx.strokeStyle = DEBUG_CONFIG.biomeOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.biomeOutlineWidth;
        ctx.beginPath();
        let hasBoundary = false;

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.worldGrid.getReadyTile(tileX, tileY);
                if (!tile) {
                    continue;
                }

                const left = tileX * this.tileSize - viewX;
                const top = tileY * this.tileSize - viewY;
                const right = left + this.tileSize;
                const bottom = top + this.tileSize;
                const rightTile = this.worldGrid.getReadyTile(tileX + 1, tileY);
                if (rightTile && rightTile.biomeTag !== tile.biomeTag) {
                    ctx.moveTo(right, top);
                    ctx.lineTo(right, bottom);
                    hasBoundary = true;
                }

                const bottomTile = this.worldGrid.getReadyTile(tileX, tileY + 1);
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
        return this.generationView.getFieldNames();
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
        return this.generationView.getSample(fieldName, tileX, tileY);
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
        const field = this.generationView.getField(fieldName);
        if (!field) {
            return;
        }

        const gradient = getFieldGradient(fieldName);
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.worldGrid.isChunkLoaded(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.worldGrid.requestChunk(chunkX, chunkY).drawNoiseOverlay(ctx, originX, originY, this.tileSize, field, gradient);
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
}
