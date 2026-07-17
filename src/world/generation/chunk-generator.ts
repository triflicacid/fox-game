import {CHUNK_SIZE} from "../chunk-size";
import {TileData} from "../tile";
import {NoiseFieldRegistry} from "./field-registry";
import {Biome, resolveBiome} from "./biome";
import {PlainsBiome} from "./plains-biome";

/** One chunk's generated tile grid, plus the biome it was generated for. */
export interface GeneratedChunk {
    biome: Biome;
    tiles: TileData[][];
}

/**
 * Orchestrates a chunk's generation.
 */
export class ChunkGenerator {
    private readonly fields = new NoiseFieldRegistry();
    private readonly biomes: readonly Biome[];

    /**
     * @param worldSeed - The world's seed.
     */
    public constructor(worldSeed: number) {
        const plains = new PlainsBiome(worldSeed);
        for (const field of plains.getFields()) {
            this.fields.register(field);
        }
        this.biomes = [plains];
    }

    /**
     * The named field registry.
     *
     * @returns This generator's field registry.
     */
    public getFields(): NoiseFieldRegistry {
        return this.fields;
    }

    /**
     * Generates the chunk at the given chunk coordinate.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns The generated biome and tile grid.
     */
    public generate(chunkX: number, chunkY: number): GeneratedChunk {
        // 1) biome fields
        const biome = resolveBiome(this.biomes, new Map());

        const tiles: TileData[][] = [];
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            const row: TileData[] = [];
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkX * CHUNK_SIZE + localX;
                const worldY = chunkY * CHUNK_SIZE + localY;
                // 2) base terrain
                const groundType = biome.sampleBaseTerrain(worldX, worldY);
                row.push({groundType, featureTag: "none"});
            }
            tiles.push(row);
        }
        return {biome, tiles};
    }
}
