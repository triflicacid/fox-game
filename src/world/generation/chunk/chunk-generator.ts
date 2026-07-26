import {CHUNK_SIZE} from "../../chunk-size";
import {TileData} from "../../tile";
import {BackgroundTileType} from "../../../sprites/BackgroundTileSpriteSheet";
import {NoiseFieldRegistry} from "../field-registry";
import {Biome, BiomeSummary, BiomeTag, resolveBiome} from "../biome/biome";
import {DesertBiome} from "../biome/desert-biome";
import {PlainsBiome} from "../biome/plains-biome";
import {Feature, FeatureProvider} from "../feature/feature";
import {CoordMap} from "../../coord-set";
import {ClimateFields} from "../biome/climate-fields";
import {GenerationContext} from "../generation-context";
import {computeCappedRegionDepths} from "../grid-algorithms";
import {
    TERRAIN_DEPTH_CONFIG,
    TerrainDepthConfig,
    validateTerrainDepthConfig,
} from "../biome/terrain-depth";

/** Fraction of a chunk that one biome must occupy to be its debug summary. */
const DOMINANT_BIOME_FRACTION = 2 / 3;

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
    private readonly biomeCache = new CoordMap<Biome>();
    private readonly terrainDepthConfig: TerrainDepthConfig;

    /**
     * @param worldSeed - The world's seed.
     * @param featureProviders - Builds this generator's features - see {@link setSeed}.
     * @param terrainDepthConfig - Bounded biome-interior terrain-depth tuning.
     */
    public constructor(
        worldSeed: number,
        private readonly featureProviders: readonly FeatureProvider[],
        terrainDepthConfig: TerrainDepthConfig = TERRAIN_DEPTH_CONFIG,
    ) {
        validateTerrainDepthConfig(terrainDepthConfig);
        this.terrainDepthConfig = {...terrainDepthConfig};
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

        this.biomes = [
            new DesertBiome(worldSeed, this.terrainDepthConfig),
            new PlainsBiome(worldSeed, this.terrainDepthConfig),
        ];
        for (const biome of this.biomes) {
            for (const field of biome.getFields()) {
                this.fields.register(field);
            }
        }

        const context: GenerationContext = {worldSeed, climate: this.climate, terrainDepth: this.terrainDepthConfig};
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

        const chunkOriginX = chunkX * CHUNK_SIZE;
        const chunkOriginY = chunkY * CHUNK_SIZE;
        const halo = this.terrainDepthConfig.maximumDepthTiles + 1;
        const paddedSize = CHUNK_SIZE + 2 * halo;
        const paddedBiomes: Biome[][] = [];
        const paddedBiomeTags: BiomeTag[][] = [];
        for (let paddedY = 0; paddedY < paddedSize; paddedY++) {
            const biomeRow: Biome[] = [];
            const tagRow: BiomeTag[] = [];
            for (let paddedX = 0; paddedX < paddedSize; paddedX++) {
                const biome = this.resolveBiomeAt(
                    chunkOriginX + paddedX - halo,
                    chunkOriginY + paddedY - halo,
                );
                biomeRow.push(biome);
                tagRow.push(biome.name);
            }
            paddedBiomes.push(biomeRow);
            paddedBiomeTags.push(tagRow);
        }
        const paddedBiomeDepths = computeCappedRegionDepths(
            paddedBiomeTags,
            this.terrainDepthConfig.maximumDepthTiles,
        );

        const tiles: TileData[][] = [];
        const biomeCounts = new Map<BiomeTag, number>();
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            const row: TileData[] = [];
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkOriginX + localX;
                const worldY = chunkOriginY + localY;
                const paddedX = localX + halo;
                const paddedY = localY + halo;
                const biome = paddedBiomes[paddedY][paddedX];
                const biomeDepth = paddedBiomeDepths[paddedY][paddedX];
                const groundType = biome.sampleBaseTerrain(worldX, worldY, biomeDepth);
                const biomeTag = biome.name;
                biomeCounts.set(biomeTag, (biomeCounts.get(biomeTag) ?? 0) + 1);
                row.push({biomeTag, biomeDepth, groundType, featureTag: "none"});
            }
            tiles.push(row);
        }

        const resolveBiomeTagAt = (worldX: number, worldY: number): BiomeTag => {
            const localX = worldX - chunkOriginX;
            const localY = worldY - chunkOriginY;
            if (Number.isInteger(localX) && Number.isInteger(localY)
                && localX >= 0 && localX < CHUNK_SIZE && localY >= 0 && localY < CHUNK_SIZE) {
                return tiles[localY][localX].biomeTag;
            }
            return this.resolveBiomeAt(worldX, worldY).name;
        };

        const resampleTerrainAt = (worldX: number, worldY: number, depth: number): BackgroundTileType => {
            const paddedX = worldX - chunkOriginX + halo;
            const paddedY = worldY - chunkOriginY + halo;
            const biome = paddedBiomes[paddedY][paddedX];
            return biome.sampleBaseTerrain(worldX, worldY, depth);
        };

        for (const feature of this.features) {
            feature.apply(tiles, chunkX, chunkY, resolveBiomeTagAt, resampleTerrainAt);
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
        let cached = this.biomeCache.get(worldX, worldY);
        if (cached === undefined) {
            cached = resolveBiome(this.biomes, this.climate.sample(worldX, worldY));
            this.biomeCache.set(worldX, worldY, cached);
        }
        return cached;
    }

    /** Returns a biome tag only when it occupies at least two-thirds of the chunk. */
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
