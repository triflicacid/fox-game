import {Tile} from "./tile";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../debug/debug-config";

/** Number of tiles along each edge of a chunk. */
export const CHUNK_SIZE = 16;

export type {ChunkSpriteSheets};

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * and identified by their integer chunk coordinates.
 */
export class Chunk {
    private readonly tiles: Tile[][];

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkY: number,
        spriteSheets: ChunkSpriteSheets,
    ) {
        this.tiles = Chunk.generateTiles(spriteSheets);
    }

    /**
     * Generates this chunk's tiles.
     * todo actual generation plz
     *
     * @param spriteSheets - Shared sprite sheets each generated tile resolves its bitmap from.
     * @returns A `CHUNK_SIZE x CHUNK_SIZE` grid of freshly generated tiles.
     */
    private static generateTiles(spriteSheets: ChunkSpriteSheets): Tile[][] {
        const tiles: Tile[][] = [];
        for (let y = 0; y < CHUNK_SIZE; y++) {
            const row: Tile[] = [];
            for (let x = 0; x < CHUNK_SIZE; x++) {
                row.push(Chunk.generateTile(spriteSheets));
            }
            tiles.push(row);
        }
        return tiles;
    }

    /**
     * Generates a single tile.
     *
     * @param spriteSheets - Shared sprite sheets to resolve the tile's bitmap from.
     * @returns The generated tile.
     */
    private static generateTile(spriteSheets: ChunkSpriteSheets): Tile {
        return new Tile("grass1", spriteSheets);
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
     * Draws every tile in this chunk as a grid of squares.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].draw(ctx, originX + x * tileSize, originY + y * tileSize, tileSize);
            }
        }
    }

    /**
     * Draws every tile's outline, then this chunk's own (thicker) outline
     * over the top, for debug rendering mode.
     *
     * @param ctx - Canvas context to draw into.
     * @param originX - Canvas X position of this chunk's top-left corner.
     * @param originY - Canvas Y position of this chunk's top-left corner.
     * @param tileSize - Width/height of each tile, in canvas pixels.
     */
    public drawDebug(ctx: CanvasRenderingContext2D, originX: number, originY: number, tileSize: number): void {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                this.tiles[y][x].drawDebugOutline(ctx, originX + x * tileSize, originY + y * tileSize, tileSize);
            }
        }

        ctx.strokeStyle = DEBUG_CONFIG.chunkOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.chunkOutlineWidth;
        ctx.strokeRect(originX, originY, CHUNK_SIZE * tileSize, CHUNK_SIZE * tileSize);

        ctx.fillStyle = DEBUG_CONFIG.chunkLabelColor;
        ctx.font = DEBUG_CONFIG.chunkLabelFont;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`(${this.chunkX}, ${this.chunkY})`, originX + DEBUG_CONFIG.chunkLabelPadding, originY + DEBUG_CONFIG.chunkLabelPadding);
    }
}
