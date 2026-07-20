import {CHUNK_SIZE} from "../chunk-size";
import {TileData} from "../tile";
import {NoiseFieldRegistry} from "./field-registry";
import {Biome, resolveBiome} from "./biome";
import {PlainsBiome} from "./plains-biome";
import {Feature, FeatureProvider} from "./feature";
import {PositionCache} from "./position-cache";

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
    private biomes: readonly Biome[] = [];
    private features: readonly Feature[] = [];
    private readonly biomeCache = new PositionCache<Biome>();

    /**
     * @param worldSeed - The world's seed.
     * @param featureProviders - Builds this generator's features - see {@link setSeed}.
     */
    public constructor(worldSeed: number, private readonly featureProviders: readonly FeatureProvider[]) {
        this.setSeed(worldSeed);
    }

    /**
     * Re-derives every biome/feature/field from a new world seed.
     *
     * @param worldSeed - The new world seed.
     */
    public setSeed(worldSeed: number): void {
        this.biomeCache.clear();

        const plains = new PlainsBiome(worldSeed);
        for (const field of plains.getFields()) {
            this.fields.register(field);
        }
        this.biomes = [plains];

        this.features = this.featureProviders.map((provider) => provider(worldSeed));
        for (const feature of this.features) {
            for (const field of feature.getFields()) {
                this.fields.register(field);
            }
        }
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

        // 3) + 4) feature masks + application
        for (const feature of this.features) {
            feature.apply(tiles, chunkX, chunkY, (worldX, worldY) => this.resolveBiomeAt(worldX, worldY));
        }

        return {biome, tiles};
    }

    /**
     * Resolves which biome applies at an arbitrary world position, sampling
     * every registered field there. This is the {@link BiomeResolver} passed to
     * every {@link Feature.apply} call.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns The biome that matches at that position.
     */
    private resolveBiomeAt(worldX: number, worldY: number): Biome {
        return this.biomeCache.get([worldX, worldY], ([x, y]) => {
            const fieldValues = new Map<string, number>();
            for (const field of this.fields.getAll()) {
                fieldValues.set(field.name, field.sample(x, y));
            }
            return resolveBiome(this.biomes, fieldValues);
        });
    }
}
