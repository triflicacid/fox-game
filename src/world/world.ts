import type {ChunkSpriteSheets, DrawableChunk} from "./chunks/chunk";
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
import {EntityCollection} from "../entities/entity-collection";
import {MovableEntity} from "../entities/movable-entity";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {DebugHudRenderer} from "../debug/debug-hud";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {FeatureTag} from "./generation/feature/feature-tag";
import {CoordMap} from "./coordinates/coord-set";
import {Effect} from "../effects/effect";
import {getFieldGradient} from "./generation/noise-field-colors";
import {Minimap, MinimapRenderer} from "../minimap/minimap";
import {MinimapStatsHudRenderer} from "../minimap/minimap-stats-hud";
import {StructureResolver} from "./collision/structure-resolver";
import {WorldCollisionSystem} from "./collision/world-collision-system";
import {EntityHoverInfo, MinimapHoverInfo, TileHoverInfo} from "./inspection/hover-info";
import {ChunkCoordinate} from "./coordinates/chunk-coordinate";
import {pixelRectToTileRange, tileToChunk} from "./coordinates/world-grid-math";
import {randomWorldSeed} from "./generation/random-world-seed";
import type {ChunkGenerationWorker} from "./generation/chunk/chunk-generation-worker";
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
    private readonly entityCollection = new EntityCollection();

    private readonly structureResolver: StructureResolver;
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
    private readonly collisionSystem: WorldCollisionSystem;

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

    public constructor(public readonly tileSize: number, dependencies: WorldDependencies) {
        this.worldSeed = dependencies.worldSeed;
        this.generationView = new WorldGenerationView(dependencies.chunkGenerator);
        this.chunkWorkerClient = dependencies.chunkWorkerClient;
        this.chunkFactory = dependencies.chunkFactory;
        this.structureResolver = new StructureResolver(dependencies.structureSheetRegistry, () => this.generationView.getStructures());
        this.chunkSpriteSheets = dependencies.chunkSpriteSheetsFactory(this.structureResolver);
        this.worldGrid = new DefaultWorldGridView<DrawableChunk>(
            this.requestChunk.bind(this),
            (chunkX, chunkY) => this.chunks.get(chunkX, chunkY),
        );
        this.worldEffects = new WorldEffects();
        this.minimapBuilder = new MinimapDataBuilder(tileSize, this.generationView, () => this.entityCollection.getMainEntity());
        this.hoverInspector = new WorldHoverInspector(tileSize, this.worldGrid, this.generationView, () => this.entityCollection.getEntities());
        this.debugSnapshotBuilder = new WorldDebugSnapshotBuilder(tileSize, this.worldGrid, this.worldGrid);
        this.collisionSystem = new WorldCollisionSystem(this.worldGrid, this.entityCollection, this.structureResolver, tileSize);
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
        this.collisionSystem.setCanMoveOntoGeneratingChunks(canMove);
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
        return this.entityCollection.getEntities();
    }

    /** The entity currently under player control. Throws if none has been set. */
    public getMainEntity(): MovableEntity {
        return this.entityCollection.getMainEntity();
    }

    /**
     * Switches which entity is under player control.
     * @returns `this`, for chaining.
     */
    public setMainEntity(entity: MovableEntity): this {
        this.entityCollection.setMainEntity(entity);
        return this;
    }

    /**
     * Teleports the main entity so its sprite centre lands on `target`,
     * bypassing collision. Works on any world position regardless of chunk state.
     */
    public teleportMainEntityTo(target: Vector2d): void {
        this.entityCollection.teleportMainEntityTo(target);
    }

    /** Advances entities, effects, chunk streaming, and collision for one tick. */
    public update(deltaMs: number, camera: Camera, spectating: boolean): void {
        this.animationElapsedMs += deltaMs;
        const previousPositions = this.entityCollection.update(deltaMs);
        this.worldEffects.update(deltaMs);
        const focus = this.getChunkGenerationFocus(camera, spectating);
        this.updateLoadedChunks(camera, focus);
        this.reorderChunkGenerationQueueIfFocusMoved(focus);
        this.collisionSystem.update(previousPositions, this.generationEnabled);
    }

    /** Returns the world-pixel point new chunk requests are prioritised around. */
    private getChunkGenerationFocus(camera: Camera, spectating: boolean): Vector2d {
        return spectating ? camera.getCenter() : this.entityCollection.getMainEntity().getPosition();
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
        this.entityCollection.draw(ctx, camera, hitboxesEnabled);
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
            const center = spectating ? camera.getCenter() : this.entityCollection.getMainEntity().getPosition();
            minimapData = this.minimapBuilder.build(center, spectating, camera, debugEnabled, noiseFieldName);
            this.minimap.draw(ctx, ctx.canvas.width, minimapData);
        }
        this.hoverInspector.setLastMinimapData(minimapData);

        if (debugEnabled) {
            const debugData = this.debugSnapshotBuilder.build(
                camera,
                this.entityCollection.getMainEntity(),
                {spectating, spectatorVelocity, actualFps, targetFps},
                this.lastVisibleChunkCount,
                this.getLoadedChunkCount(),
                this.getGeneratingChunkCount(),
                this.getLatestChunkGenerationTimeMs(),
                this.getAverageChunkGenerationTimeMs(),
                this.collisionSystem.getDebugState(),
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
     * {@link EntityCollection.draw} - see {@link Chunk.drawProps}.
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
}
