import type {Camera} from "../../camera/camera";
import {Vector2d} from "../../geometry/vector2d";
import type {ChunkCoordinate} from "../coordinates/chunk-coordinate";
import {tileToChunk} from "../coordinates/world-grid-math";
import type {ChunkGenerationWorker} from "../generation/chunk/chunk-generation-worker";
import type {ChunkFactory} from "../world-dependencies";
import type {ChunkSpriteSheets} from "../rendering/chunk-sprite-sheets";
import type {DrawableChunk} from "./chunk";
import {CHUNK_SIZE} from "./chunk-size";
import {
    bufferChunkRange,
    chunkGenerationPriority,
    coordinatesInRange,
    DEFAULT_CHUNK_BUFFER,
    isOutsideChunkRange,
    visibleChunkRange,
} from "./chunk-streaming-math";
import type {ChunkStore} from "./chunk-store";

/**
 * Owns loaded-chunk streaming policy: requesting, buffering, evicting, and
 * prioritising generation around a moving focus point. Delegates actual
 * storage to `ChunkStore` and generation to `ChunkGenerationWorker`.
 */
export class ChunkStreamingManager {
    /** Debug knob: minimum time the worker leaves between chunks. `0` disables it. */
    private minGenerationDelayMs = 0;

    /** Sum of every generated chunk's `generationTimeMs`. */
    private totalGenerationTimeMs = 0;
    /** Count of chunks contributing to {@link totalGenerationTimeMs}. */
    private generatedChunkCount = 0;
    /** `generationTimeMs` of the most recently generated chunk. */
    private latestGenerationTimeMs = 0;

    /** Chunk {@link getGenerationFocus} was in as of the last {@link reorderQueueIfFocusMoved} call. */
    private lastFocusChunk: ChunkCoordinate | undefined;

    /** Whether new chunks may be generated. */
    private generationEnabled = true;

    private worldSeed: number;

    /**
     * @param store - Owns the loaded-chunk map this manager streams into/out of.
     * @param worker - Background chunk generation.
     * @param chunkFactory - Constructs one runtime chunk around a worker's generation result.
     * @param chunkSpriteSheets - Shared sprite dependencies every constructed chunk renders with.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     * @param worldSeed - Seed new chunks generate from.
     */
    public constructor(
        private readonly store: ChunkStore<DrawableChunk>,
        private readonly worker: ChunkGenerationWorker,
        private readonly chunkFactory: ChunkFactory,
        private readonly chunkSpriteSheets: ChunkSpriteSheets,
        private readonly tileSize: number,
        worldSeed: number,
    ) {
        this.worldSeed = worldSeed;
    }

    /** The seed currently used to generate new chunks. */
    public getWorldSeed(): number {
        return this.worldSeed;
    }

    /** Changes the seed used for new chunks. Already-loaded chunks are kept; only future generation uses `seed`. */
    public setWorldSeed(seed: number): void {
        this.worldSeed = seed;
        this.worker.setSeed(seed);
    }

    /** Whether new chunks may currently be generated. */
    public isGenerationEnabled(): boolean {
        return this.generationEnabled;
    }

    /** Enables or disables chunk generation. Disabling also clears the pending generation queue. */
    public setGenerationEnabled(enabled: boolean): void {
        this.generationEnabled = enabled;
        if (!enabled) {
            this.cancelPendingGeneration();
        }
    }

    /** Minimum time the worker leaves between chunks, in ms. `0` means disabled. */
    public getMinGenerationDelayMs(): number {
        return this.minGenerationDelayMs;
    }

    /** Sets the minimum-delay-between-chunks debug knob. Takes effect immediately and persists across seed changes. */
    public setMinGenerationDelayMs(delayMs: number): void {
        this.minGenerationDelayMs = delayMs;
        this.worker.setMinGenerationDelayMs(delayMs);
    }

    /** Returns the chunk at the given coordinate, requesting generation if it isn't loaded yet. */
    public requestChunk(chunkX: number, chunkY: number): DrawableChunk {
        let chunk = this.store.get(chunkX, chunkY);
        if (!chunk) {
            const generation = this.worker.requestChunk(chunkX, chunkY);
            chunk = this.chunkFactory(chunkX, chunkY, generation, this.chunkSpriteSheets, this.tileSize);
            this.store.set(chunkX, chunkY, chunk);
            generation
                .then((result) => {
                    this.latestGenerationTimeMs = result.generationTimeMs;
                    this.totalGenerationTimeMs += result.generationTimeMs;
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
        return this.store.size;
    }

    /** How many currently loaded chunks are still generating. */
    public getGeneratingChunkCount(): number {
        return this.store.getGeneratingCount();
    }

    /** Mean generation time across every chunk generated this session, in ms. */
    public getAverageGenerationTimeMs(): number {
        return this.generatedChunkCount === 0 ? 0 : this.totalGenerationTimeMs / this.generatedChunkCount;
    }

    /** Generation time of the most recently finished chunk, in ms. */
    public getLatestGenerationTimeMs(): number {
        return this.latestGenerationTimeMs;
    }

    /** Drops a chunk from memory. Safe to call when the chunk is not loaded. */
    public unloadChunk(chunkX: number, chunkY: number): void {
        this.store.remove(chunkX, chunkY);
    }

    /** Drops every loaded chunk and cancels any pending generation requests. */
    public reloadAll(): void {
        this.worker.cancelPending();
        this.store.clear();
    }

    /** Cancels all pending chunk requests and drops any not-yet-ready chunks. */
    public cancelPendingGeneration(): void {
        this.worker.cancelPending();
        const toDelete = [...this.store.values()].filter((chunk) => !chunk.isReady());
        for (const chunk of toDelete) {
            this.store.remove(chunk.getChunkX(), chunk.getChunkY());
        }
    }

    /**
     * Returns the world-pixel point new chunk requests are prioritised
     * around. `getMainEntityPosition` is only invoked while not spectating.
     */
    public getGenerationFocus(camera: Camera, spectating: boolean, getMainEntityPosition: () => Vector2d): Vector2d {
        return spectating ? camera.getCenter() : getMainEntityPosition();
    }

    /**
     * Re-sorts the worker's pending queue by generation priority, but only
     * when `focus` has crossed a chunk boundary since the last call.
     */
    public reorderQueueIfFocusMoved(focus: Vector2d): void {
        const tileX = Math.floor(focus.x / this.tileSize);
        const tileY = Math.floor(focus.y / this.tileSize);
        const chunk = tileToChunk(tileX, tileY);
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;

        if (this.lastFocusChunk && this.lastFocusChunk.chunkX === chunk.chunkX && this.lastFocusChunk.chunkY === chunk.chunkY) {
            return;
        }
        this.lastFocusChunk = chunk;

        const order = [...this.worker.getPendingChunks()].sort((a, b) =>
            chunkGenerationPriority(a, focus.x, focus.y, chunkPixelSize)
            - chunkGenerationPriority(b, focus.x, focus.y, chunkPixelSize)
        );
        this.worker.reorderPending(order);
    }

    /**
     * Loads/generates chunks within the camera view plus a buffer, and evicts
     * any that have drifted beyond it. A no-op while generation is disabled.
     */
    public update(camera: Camera, focus: Vector2d): void {
        if (!this.generationEnabled) {
            return;
        }

        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const visible = visibleChunkRange(camera.getViewX(), camera.getViewY(), camera.getWidth(), camera.getHeight(), chunkPixelSize);
        const buffered = bufferChunkRange(visible, DEFAULT_CHUNK_BUFFER);
        const pending = [...coordinatesInRange(buffered)].filter(({chunkX, chunkY}) => !this.store.has(chunkX, chunkY));

        pending.sort((a, b) =>
            chunkGenerationPriority(a, focus.x, focus.y, chunkPixelSize)
            - chunkGenerationPriority(b, focus.x, focus.y, chunkPixelSize)
        );
        for (const {chunkX, chunkY} of pending) {
            this.requestChunk(chunkX, chunkY);
        }

        for (const chunk of this.store.values()) {
            const chunkX = chunk.getChunkX();
            const chunkY = chunk.getChunkY();
            if (isOutsideChunkRange(chunkX, chunkY, buffered)) {
                this.unloadChunk(chunkX, chunkY);
            }
        }
    }

    /** Every chunk coordinate currently requested but not yet resolved, in request order. */
    public getPendingChunks(): readonly ChunkCoordinate[] {
        return this.worker.getPendingChunks();
    }

    /** A chunk coordinate's position in the request queue, or `undefined` if it isn't currently pending. */
    public getQueuePosition(chunkX: number, chunkY: number): number | undefined {
        return this.worker.getQueuePosition(chunkX, chunkY);
    }

    /** Re-sorts the still-queued requests to match `order`, most urgent first. */
    public reorderPending(order: readonly ChunkCoordinate[]): void {
        this.worker.reorderPending(order);
    }

    /** Cancels pending requests and terminates the underlying worker. */
    public dispose(): void {
        this.worker.terminate();
    }
}
