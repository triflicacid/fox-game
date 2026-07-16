import {Chunk, CHUNK_SIZE} from "./chunk";
import {Tile} from "./tile";

/** A chunk's position, in chunk units (not tiles/pixels). */
export interface ChunkCoordinate {
    chunkX: number;
    chunkY: number;
}

/**
 * The game world: an effectively infinite 2D grid of tiles, split into
 * fixed-size {@link Chunk}s that are generated on demand and cached in
 * memory as they're needed. Chunk deltas (edits diverging from generation)
 * aren't persisted yet; see `initial-plan.md` for the planned storage design.
 */
export class World {
    private readonly chunks = new Map<string, Chunk>();

    /**
     * @param tileSize - Width/height of a single tile, in canvas pixels.
     */
    public constructor(public readonly tileSize: number) {
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
     * Builds the key {@link chunks} is keyed by for a given chunk coordinate.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns A string uniquely identifying that chunk coordinate.
     */
    private static chunkKey(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
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
        const key = World.chunkKey(chunkX, chunkY);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new Chunk(chunkX, chunkY);
            this.chunks.set(key, chunk);
        }
        return chunk;
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
        return this.chunks.has(World.chunkKey(chunkX, chunkY));
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
        this.chunks.delete(World.chunkKey(chunkX, chunkY));
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

    /**
     * Draws every chunk that overlaps the given view rectangle, loading
     * (and caching) any of those chunks that aren't already loaded.
     *
     * @param ctx - Canvas context to draw into.
     * @param viewX - Left edge of the visible view, in world pixels (tile units * {@link tileSize}).
     * @param viewY - Top edge of the visible view, in world pixels.
     * @param viewWidth - Width of the visible view, in canvas pixels.
     * @param viewHeight - Height of the visible view, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number, viewWidth: number, viewHeight: number): void {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;

        const startChunkX = Math.floor(viewX / chunkPixelSize);
        const startChunkY = Math.floor(viewY / chunkPixelSize);
        const endChunkX = Math.floor((viewX + viewWidth) / chunkPixelSize);
        const endChunkY = Math.floor((viewY + viewHeight) / chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const chunk = this.getChunk(chunkX, chunkY);
                chunk.draw(ctx, chunkX * chunkPixelSize - viewX, chunkY * chunkPixelSize - viewY, this.tileSize);
            }
        }
    }
}
