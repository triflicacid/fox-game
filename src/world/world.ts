import type {ChunkSpriteSheets, DrawableChunk} from "./chunks/chunk";
import {ChunkStore} from "./chunks/chunk-store";
import {ChunkStreamingManager} from "./chunks/chunk-streaming-manager";
import {DefaultWorldGridView} from "./tiles/world-grid-view";
import {EntityCollection, type ReadonlyEntityCollection} from "../entities/entity-collection";
import {MovableEntity} from "../entities/movable-entity";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {Effect} from "../effects/effect";
import {StructureResolver} from "./collision/structure-resolver";
import {WorldCollisionSystem} from "./collision/world-collision-system";
import {EntityHoverInfo, MinimapHoverInfo, TileHoverInfo} from "./inspection/hover-info";
import {randomWorldSeed} from "./generation/random-world-seed";
import type {WorldDependencies} from "./world-dependencies";
import {WorldEffects} from "./effects/world-effects";
import {WorldGenerationView} from "./generation/world-generation-view";
import {MinimapDataBuilder} from "./inspection/minimap-data-builder";
import {WorldHoverInspector} from "./inspection/world-hover-inspector";
import {WorldDebugSnapshotBuilder} from "./inspection/world-debug-snapshot-builder";
import {WorldRenderer} from "./rendering/world-renderer";

/**
 * The game world: an effectively infinite 2D grid of tiles, split into
 * fixed-size {@link Chunk}s that are generated on demand and cached in
 * memory as they're needed.
 */
export class World {
    private readonly chunkStore = new ChunkStore<DrawableChunk>();
    private readonly entityCollection = new EntityCollection();

    private readonly structureResolver: StructureResolver;
    private readonly chunkSpriteSheets: ChunkSpriteSheets;
    private readonly chunkStreaming: ChunkStreamingManager;
    private readonly worldGrid: DefaultWorldGridView<DrawableChunk>;

    private readonly generationView: WorldGenerationView;
    private readonly worldEffects: WorldEffects;
    private readonly minimapBuilder: MinimapDataBuilder;
    private readonly hoverInspector: WorldHoverInspector;
    private readonly debugSnapshotBuilder: WorldDebugSnapshotBuilder;
    private readonly collisionSystem: WorldCollisionSystem;
    private readonly renderer: WorldRenderer;

    public constructor(public readonly tileSize: number, dependencies: WorldDependencies) {
        this.generationView = new WorldGenerationView(dependencies.chunkGenerator);
        this.structureResolver = new StructureResolver(dependencies.structureSheetRegistry, () => this.generationView.getStructures());
        this.chunkSpriteSheets = dependencies.chunkSpriteSheetsFactory(this.structureResolver);
        this.chunkStreaming = new ChunkStreamingManager(
            this.chunkStore,
            dependencies.chunkWorkerClient,
            dependencies.chunkFactory,
            this.chunkSpriteSheets,
            tileSize,
            dependencies.worldSeed,
        );
        this.worldGrid = new DefaultWorldGridView<DrawableChunk>(
            this.chunkStreaming.requestChunk.bind(this.chunkStreaming),
            (chunkX, chunkY) => this.chunkStore.get(chunkX, chunkY),
        );
        this.worldEffects = new WorldEffects();
        this.minimapBuilder = new MinimapDataBuilder(tileSize, this.generationView, () => this.entityCollection.getMainEntity());
        this.hoverInspector = new WorldHoverInspector(tileSize, this.worldGrid, this.generationView, () => this.entityCollection.getEntities());
        this.debugSnapshotBuilder = new WorldDebugSnapshotBuilder(tileSize, this.worldGrid, this.worldGrid);
        this.collisionSystem = new WorldCollisionSystem(this.worldGrid, this.entityCollection, this.structureResolver, tileSize);
        this.renderer = new WorldRenderer(
            tileSize,
            this.chunkStore,
            this.chunkStreaming.requestChunk.bind(this.chunkStreaming),
            this.entityCollection,
            this.worldEffects,
            this.minimapBuilder,
            this.hoverInspector,
            this.debugSnapshotBuilder,
            this.generationView,
            this.chunkStreaming.getQueuePosition.bind(this.chunkStreaming),
            dependencies.debugHud,
            dependencies.minimap,
            dependencies.minimapStatsHud,
        );
    }

    /** Adds `effect` to the active set; it will be advanced and drawn until it expires. */
    public registerEffect(effect: Effect): void {
        this.worldEffects.register(effect);
    }

    /** The seed currently used to generate new chunks. */
    public getWorldSeed(): number {
        return this.chunkStreaming.getWorldSeed();
    }

    /**
     * Changes the seed used for new chunks. Already-loaded chunks are kept;
     * only future generation uses `seed`.
     */
    public setWorldSeed(seed: number): void {
        this.chunkStreaming.setWorldSeed(seed);
        this.generationView.setSeed(seed);
        this.debugSnapshotBuilder.clearBiomeRegionCache();
    }

    /** Replaces the world seed with a fresh random one - see {@link setWorldSeed}. */
    public refreshWorldSeed(): void {
        this.setWorldSeed(randomWorldSeed());
    }

    /** The chunk-streaming manager, for console debugging - see `exposeGlobals`. */
    public getChunkStreamingManager(): ChunkStreamingManager {
        return this.chunkStreaming;
    }

    /** The live entity set, for field-registry wiring - see `registerDynamicFields`. */
    public getEntityCollection(): ReadonlyEntityCollection {
        return this.entityCollection;
    }

    /** Drops every loaded chunk and cancels any pending generation requests. */
    public reloadAllChunks(): void {
        this.chunkStreaming.reloadAll();
    }

    /** Whether new chunks may currently be generated. */
    public isGenerationEnabled(): boolean {
        return this.chunkStreaming.isGenerationEnabled();
    }

    /**
     * Enables or disables chunk generation. Disabling also clears the pending
     * generation queue.
     */
    public setGenerationEnabled(enabled: boolean): void {
        this.chunkStreaming.setGenerationEnabled(enabled);
    }

    /** Whether the minimap is currently shown. */
    public getMinimapEnabled(): boolean {
        return this.renderer.isMinimapEnabled();
    }

    /**
     * Shows or hides the minimap. Independent of the debug overlay toggle.
     * Re-enabling is handled transparently by `Minimap`'s own stale-centre
     * fallback.
     */
    public setMinimapEnabled(enabled: boolean): void {
        this.renderer.setMinimapEnabled(enabled);
    }

    /** Enables or disables movement onto still-generating chunks. */
    public setCanMoveOntoGeneratingChunks(canMove: boolean): void {
        this.collisionSystem.setCanMoveOntoGeneratingChunks(canMove);
    }

    /** Returns hover data for the tile at a world tile position, or `undefined` while its chunk is unready. */
    public getTileHoverInfo(tileX: number, tileY: number): TileHoverInfo | undefined {
        return this.hoverInspector.getTileHoverInfo(tileX, tileY, this.renderer.getAnimationElapsedMs());
    }

    /** Returns hover data for the minimap region under a screen point, or `undefined`. */
    public getMinimapHoverInfo(screenX: number, screenY: number, canvasWidth: number): MinimapHoverInfo | undefined {
        return this.hoverInspector.getMinimapHoverInfo(screenX, screenY, canvasWidth);
    }

    /** Returns hover data for the topmost entity at a world-pixel point, or `undefined`. */
    public getEntityHoverInfo(worldX: number, worldY: number): EntityHoverInfo | undefined {
        return this.hoverInspector.getEntityHoverInfo(worldX, worldY);
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
        this.renderer.advanceAnimation(deltaMs);
        const previousPositions = this.entityCollection.update(deltaMs);
        this.worldEffects.update(deltaMs);
        const focus = this.chunkStreaming.getGenerationFocus(camera, spectating, () => this.entityCollection.getMainEntity().getPosition());
        this.chunkStreaming.update(camera, focus);
        this.chunkStreaming.reorderQueueIfFocusMoved(focus);
        this.collisionSystem.update(previousPositions, this.chunkStreaming.isGenerationEnabled());
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
        this.renderer.draw(ctx, camera, debugEnabled, bordersEnabled, hitboxesEnabled, spectating, spectatorVelocity, actualFps, targetFps, noiseFieldName, {
            generationEnabled: this.chunkStreaming.isGenerationEnabled(),
            loadedChunkCount: this.chunkStreaming.getLoadedChunkCount(),
            generatingChunkCount: this.chunkStreaming.getGeneratingChunkCount(),
            latestChunkGenerationTimeMs: this.chunkStreaming.getLatestGenerationTimeMs(),
            averageChunkGenerationTimeMs: this.chunkStreaming.getAverageGenerationTimeMs(),
            collision: this.collisionSystem.getDebugState(),
        });
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

    /** Releases every worker-backed and stateful resource this world owns. */
    public dispose(): void {
        this.entityCollection.clear();
        this.worldEffects.clear();
        this.collisionSystem.clear();
        this.chunkStreaming.dispose();
    }
}
