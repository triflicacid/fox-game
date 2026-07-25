import {CHUNK_SIZE} from "../chunk-size";
import {TileData} from "../tile";
import {NoiseFieldRegistry} from "./field-registry";
import {Biome, BiomeSummary, BiomeTag, resolveBiome} from "./biome";
import {PlainsBiome} from "./plains-biome";
import {Feature, FeatureProvider} from "./feature";
import {PositionCache} from "./position-cache";
import {ClimateFields} from "./climate-fields";
import {GenerationContext} from "./generation-context";

/** Fraction of a chunk that one biome must occupy to be its debug summary. */
const DOMINANT_BIOME_FRACTION = 0.9;

/** One chunk's generated tile grid and non-authoritative biome summary. */
export interface GeneratedChunk {
    biomeSummary: BiomeSummary;
    tiles: TileData[][];
}

/**
 * Orchestrates a chunk's generation.
 */
export class ChunkGenerator {
    private readonly fields = new NoiseFieldRegistry();
    private climate!: ClimateFields;
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
        this.fields.clear();

        this.climate = new ClimateFields(worldSeed);
        for (const field of this.climate.getFields()) {
            this.fields.register(field);
        }

        const plains = new PlainsBiome(worldSeed);
        for (const field of plains.getFields()) {
            this.fields.register(field);
        }
        this.biomes = [plains];

        const context = {worldSeed, climate: this.climate} as GenerationContext;
        this.features = this.featureProviders.map((provider) => provider(context));
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
     * @returns The generated biome summary and tile grid.
     */
    public generate(chunkX: number, chunkY: number): GeneratedChunk {
        this.biomeCache.clear();

        const tiles: TileData[][] = [];
        const biomeCounts = new Map<BiomeTag, number>();
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            const row: TileData[] = [];
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkX * CHUNK_SIZE + localX;
                const worldY = chunkY * CHUNK_SIZE + localY;
                const biome = this.resolveBiomeAt(worldX, worldY);
                const groundType = biome.sampleBaseTerrain(worldX, worldY);
                const biomeTag = biome.name;
                biomeCounts.set(biomeTag, (biomeCounts.get(biomeTag) ?? 0) + 1);
                row.push({biomeTag, groundType, featureTag: "none"});
            }
            tiles.push(row);
        }

        const chunkOriginX = chunkX * CHUNK_SIZE;
        const chunkOriginY = chunkY * CHUNK_SIZE;
        const resolveBiomeTagAt = (worldX: number, worldY: number): BiomeTag => {
            const localX = worldX - chunkOriginX;
            const localY = worldY - chunkOriginY;
            if (Number.isInteger(localX) && Number.isInteger(localY)
                && localX >= 0 && localX < CHUNK_SIZE && localY >= 0 && localY < CHUNK_SIZE) {
                return tiles[localY][localX].biomeTag;
            }
            return this.resolveBiomeAt(worldX, worldY).name;
        };

        for (const feature of this.features) {
            feature.apply(tiles, chunkX, chunkY, resolveBiomeTagAt);
        }

        return {biomeSummary: this.summariseBiomes(biomeCounts), tiles};
    }

    /**
     * Resolves which biome applies at an arbitrary world position, sampling
     * only the shared climate fields and caching within the current generation operation.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns The biome that matches at that position.
     */
    private resolveBiomeAt(worldX: number, worldY: number): Biome {
        return this.biomeCache.get([worldX, worldY], ([x, y]) =>
            resolveBiome(this.biomes, this.climate.sample(x, y)));
    }

    /** Returns a biome tag only when it occupies at least 90% of the chunk. */
    private summariseBiomes(counts: ReadonlyMap<BiomeTag, number>): BiomeSummary {
        const dominantTileCount = Math.ceil(CHUNK_SIZE * CHUNK_SIZE * DOMINANT_BIOME_FRACTION);
        for (const [tag, count] of counts) {
            if (count >= dominantTileCount) {
                return tag;
            }
        }
        return "mixed";
    }
}
