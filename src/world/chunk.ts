import {Tile, TileData} from "./tile";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {Biome, sampleChunkBiome, sampleGrassType} from "./terrain-generator";
import {CHUNK_SIZE} from "./chunk-size";
import {Feature} from "./features/feature";
import {LakeFeature} from "./features/lake-feature";
import {RiverFeature} from "./features/river-feature";

export type {ChunkSpriteSheets};
export {CHUNK_SIZE};

/**
 * One shared, no-argument instance of every feature type, tried in this
 * order - see {@link Chunk.applyFeatures}. Each is a "prototype": it exists
 * only to call its instance methods (`getApplicableBiomes`, `tryGenerate`,
 * ...) on before any real occurrence has been found, since TypeScript has no
 * abstract-static-member support (see `Feature`'s doc).
 */
const FEATURE_PROTOTYPES: readonly Feature[] = [new LakeFeature(), new RiverFeature()];

/**
 * A fixed-size square region of the world, made up of `CHUNK_SIZE x
 * CHUNK_SIZE` {@link Tile}s. Chunks are generated on demand by {@link World}
 * and identified by their integer chunk coordinates.
 */
export class Chunk {
    private readonly tiles: Tile[][];

    /** This chunk's biome, sampled once for the whole chunk. */
    public readonly biome: Biome;

    /**
     * @param chunkX - This chunk's X coordinate, in chunk units (not tiles/pixels).
     * @param chunkY - This chunk's Y coordinate, in chunk units (not tiles/pixels).
     * @param worldSeed - The world's seed, so every noise channel samples deterministically.
     * @param spriteSheets - Shared sprite sheets this chunk's tiles/props resolve their bitmaps from.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkY: number,
        worldSeed: number,
        spriteSheets: ChunkSpriteSheets,
    ) {
        this.biome = sampleChunkBiome(worldSeed, chunkX, chunkY);

        const grid = this.generateTerrain(worldSeed);
        this.applyFeatures(worldSeed, grid);
        this.tiles = grid.map((row) => row.map((data) => new Tile(data, spriteSheets)));
    }

    /**
     * Phase 1: terrain.
     *
     * Plain grass variety for every tile, sampled at each
     * tile's absolute world coordinate (not chunk-local) so neighbouring
     * chunks agree at their shared boundary.
     *
     * @param worldSeed - The world's seed.
     * @returns A `CHUNK_SIZE x CHUNK_SIZE` grid of mutable tile data, not yet built into `Tile`s.
     */
    private generateTerrain(worldSeed: number): TileData[][] {
        const grid: TileData[][] = [];
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            const row: TileData[] = [];
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = this.chunkX * CHUNK_SIZE + localX;
                const worldY = this.chunkY * CHUNK_SIZE + localY;
                row.push({groundType: sampleGrassType(worldSeed, worldX, worldY), feature: null});
            }
            grid.push(row);
        }
        return grid;
    }

    /**
     * Phase 2: features.
     *
     * Every feature type eligible for this chunk's biome
     * ({@link Feature.getApplicableBiomes}) rolls its own noise-driven
     * chance to generate ({@link Feature.tryGenerate}). Each one paints
     * itself over `grid` ({@link Feature.paint}).
     * A feature may span more than one chunk; `paint` only fills in
     * whatever portion of it falls within this chunk's own tiles.
     *
     * @param worldSeed - The world's seed.
     * @param grid - This chunk's mutable tile data, from {@link generateTerrain}.
     */
    private applyFeatures(worldSeed: number, grid: TileData[][]): void {
        for (const prototype of FEATURE_PROTOTYPES) {
            if (!prototype.getApplicableBiomes().includes(this.biome)) {
                continue;
            }
            for (const feature of prototype.tryGenerate(worldSeed, this)) {
                feature.paint(grid, this);
            }
        }
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
        ctx.fillText(`(${this.chunkX}, ${this.chunkY}), ${this.biome}`, originX + DEBUG_CONFIG.chunkLabelPadding, originY + DEBUG_CONFIG.chunkLabelPadding);

    }
}
