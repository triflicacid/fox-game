import {Tile} from "./tile";
import {PASTEL_TILE_COLORS} from "./pastel-colors";
import {randomElement} from "../util";

/** Number of tiles along each edge of a chunk. */
export const CHUNK_SIZE = 16;

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * and identified by their integer chunk coordinates (not tile/pixel
 * coordinates).
 */
export class Chunk {
    private readonly tiles: Tile[][];

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     */
    public constructor(public readonly chunkX: number, public readonly chunkY: number) {
        this.tiles = Chunk.generateTiles();
    }

    /**
     * Generates this chunk's tiles. Currently just picks a random pastel
     * colour per tile; will later be replaced with Perlin-noise-driven
     * terrain/biome generation seeded by the chunk's coordinates.
     *
     * @returns A `CHUNK_SIZE x CHUNK_SIZE` grid of freshly generated tiles.
     */
    private static generateTiles(): Tile[][] {
        const tiles: Tile[][] = [];
        for (let y = 0; y < CHUNK_SIZE; y++) {
            const row: Tile[] = [];
            for (let x = 0; x < CHUNK_SIZE; x++) {
                row.push(new Tile(randomElement(PASTEL_TILE_COLORS)));
            }
            tiles.push(row);
        }
        return tiles;
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
}
