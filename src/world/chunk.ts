import {Tile} from "./tile";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {CHUNK_SIZE} from "./chunk-size";
import {ChunkGenerationResult} from "./generation/chunk-worker-protocol";
import {requireNonNull} from "../util";

export type {ChunkSpriteSheets};
export {CHUNK_SIZE};

/** Fill colour for a chunk that hasn't finished generating yet. */
const PENDING_COLOR = "#000000";

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * (on a background worker - see `ChunkWorkerClient`) and identified by their
 * integer chunk coordinates.
 */
export class Chunk {
    /** Empty until {@link hydrate} resolves - see {@link isReady}. */
    private tiles: Tile[][] = [];

    /** Rendered once every tile's sprite has loaded. `null` until then, during which {@link draw} falls back to a per-tile loop. */
    private cachedBitmap: ImageBitmap | null = null;

    /** This chunk's biome name, sampled once for the whole chunk. Empty until {@link isReady}. */
    public biomeName = "";

    /** How long generation took for this chunk, in milliseconds. `0` until {@link isReady}. */
    public generationTimeMs = 0;

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param generation - Resolves with this chunk's generated biome/tile data once the worker responds.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels - fixed for the `World` this chunk belongs to, so {@link cacheBitmap} can size its offscreen canvas once.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkY: number,
        generation: Promise<ChunkGenerationResult>,
        spriteSheets: ChunkSpriteSheets,
        tileSize: number,
    ) {
        void this.hydrate(generation, spriteSheets, tileSize);
    }

    /**
     * Populates this chunk's biome/tile data once `generation` resolves,
     * then caches its bitmap. If `generation` rejects (the worker was
     * terminated before responding, e.g. from a world seed change), this
     * chunk is left permanently un-generated.
     *
     * @param generation - Resolves with this chunk's generated biome/tile data.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async hydrate(generation: Promise<ChunkGenerationResult>, spriteSheets: ChunkSpriteSheets, tileSize: number): Promise<void> {
        let result: ChunkGenerationResult;
        try {
            result = await generation;
        } catch {
            return;
        }

        this.biomeName = result.biomeName;
        this.generationTimeMs = result.generationTimeMs;
        this.tiles = result.tiles.map((row) => row.map((data) => new Tile(data, spriteSheets)));

        await this.cacheBitmap(tileSize);
    }

    /**
     * Whether this chunk has finished generating.
     *
     * @returns `true` once this chunk's biome/tile data is populated.
     */
    public isReady(): boolean {
        return this.tiles.length > 0;
    }

    /**
     * Renders this chunk once to an offscreen bitmap so {@link draw} can blit
     * it instead of redrawing every tile every frame.
     *
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    private async cacheBitmap(tileSize: number): Promise<void> {
        await Promise.all(this.tiles.flatMap((row) => row.map((tile) => tile.whenReady())));

        const pixelSize = CHUNK_SIZE * tileSize;
        const offscreen = new OffscreenCanvas(pixelSize, pixelSize);
        const ctx = requireNonNull(offscreen.getContext("2d"));
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, x * tileSize, y * tileSize, tileSize);
            }
        }
        this.cachedBitmap = offscreen.transferToImageBitmap();
    }

    /**
     * Looks up the tile at the given local position within this chunk.
     *
     * @param localX - Tile's X position within the chunk, 0 to `CHUNK_SIZE - 1`.
     * @param localY - Tile's Y position within the chunk, 0 to `CHUNK_SIZE - 1`.
     * @returns The tile at that position.
     * @throws {Error} If `localX`/`localY` is outside the chunk's bounds, or if this chunk hasn't finished generating yet (see {@link isReady}).
     */
    public getTile(localX: number, localY: number): Tile {
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            throw new Error(`Tile position (${localX}, ${localY}) is outside chunk bounds`);
        }
        if (!this.isReady()) {
            throw new Error(`Chunk (${this.chunkX}, ${this.chunkY}) hasn't finished generating yet`);
        }
        return this.tiles[localY][localX];
    }

    /**
     * Draws this chunk: blits {@link cachedBitmap} if it's ready, otherwise
     * falls back to drawing every tile individually. While this chunk hasn't
     * finished generating yet, fills its bounds with a placeholder colour
     * instead.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        if (!this.isReady()) {
            ctx.fillStyle = PENDING_COLOR;
            ctx.fillRect(originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
            return;
        }

        if (this.cachedBitmap) {
            ctx.drawImage(this.cachedBitmap, originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);
            return;
        }

        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, originX + x * tileSize, originY + y * tileSize, tileSize);
            }
        }
    }

    /**
     * Draws this chunk's outline and coordinate label, for debug rendering
     * mode. While this chunk hasn't finished generating, also draws its
     * position in the generation queue, centred in the chunk, if known.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     * @param queuePosition - This chunk's position in the generation queue, or `undefined` if it isn't queued (or is already ready).
     */
    public drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number, queuePosition?: number): void {
        const pixelSize = CHUNK_SIZE * tileSize;

        ctx.strokeStyle = this.isReady() ? DEBUG_CONFIG.chunkOutlineColor : DEBUG_CONFIG.chunkPendingOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(originX, originY, pixelSize, pixelSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), ${this.isReady() ? this.biomeName : "generating..."}`, originX + DEBUG_CONFIG.chunkLabelPadding, originY + DEBUG_CONFIG.chunkLabelPadding);

        if (queuePosition !== undefined) {
            ctx.fillStyle = DEBUG_CONFIG.chunkPendingOutlineColor;
            ctx.font = DEBUG_CONFIG.chunkQueuePositionFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(queuePosition), originX + pixelSize / 2, originY + pixelSize / 2);
        }
    }
}
