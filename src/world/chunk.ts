import {Tile} from "./tile";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {CHUNK_SIZE} from "./chunk-size";
import {Biome} from "./generation/biome";
import {ChunkGenerator} from "./generation/chunk-generator";
import {requireNonNull} from "../util";

export type {ChunkSpriteSheets};
export {CHUNK_SIZE};

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * and identified by their integer chunk coordinates.
 */
export class Chunk {
    private readonly tiles: Tile[][];

    /** Rendered once every tile's sprite has loaded. `null` until then, during which {@link draw} falls back to a per-tile loop. */
    private cachedBitmap: ImageBitmap | null = null;

    /** This chunk's biome, sampled once for the whole chunk. */
    public readonly biome: Biome;

    /** How long {@link ChunkGenerator.generate} took for this chunk, in milliseconds. */
    public readonly generationTimeMs: number;

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param generator - Generates this chunk's biome and tile grid.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     * @param tileSize - Width/height a tile renders at, in canvas pixels - fixed for the `World` this chunk belongs to, so {@link cacheBitmap} can size its offscreen canvas once.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkY: number,
        generator: ChunkGenerator,
        spriteSheets: ChunkSpriteSheets,
        tileSize: number,
    ) {
        const generationStart = performance.now();
        const generated = generator.generate(chunkX, chunkY);
        this.generationTimeMs = performance.now() - generationStart;

        this.biome = generated.biome;
        this.tiles = generated.tiles.map((row) => row.map((data) => new Tile(data, spriteSheets)));

        void this.cacheBitmap(tileSize);
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
     * @throws {Error} If `localX`/`localY` is outside the chunk's bounds.
     */
    public getTile(localX: number, localY: number): Tile {
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            throw new Error(`Tile position (${localX}, ${localY}) is outside chunk bounds`);
        }
        return this.tiles[localY][localX];
    }

    /**
     * Draws this chunk: blits {@link cachedBitmap} if it's ready, otherwise
     * falls back to drawing every tile individually.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
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
     * Draws this chunk's outline and coordinate label, for debug rendering mode.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        ctx.strokeStyle = DEBUG_CONFIG.chunkOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), ${this.biome.name}`, originX + DEBUG_CONFIG.chunkLabelPadding, originY + DEBUG_CONFIG.chunkLabelPadding);
    }
}
