import {BackgroundTileType} from "../../../sprites/background-tile-sprite-sheet";
import {Biome} from "./biome";
import {ClimateSample} from "./climate-fields";
import {NoiseField, ValueNoiseField} from "../noise-field";
import {selectTerrainVariant, TERRAIN_DEPTH_CONFIG, TerrainDepthConfig, TerrainDepthVariants} from "./terrain-depth";

/** Per-channel seed offset for grass variety. */
const GRASS_VARIANT_SEED_OFFSET = 1013;

/** Noise cycles per tile for grass variety: one lattice cell spans 10 tiles. */
const GRASS_VARIANT_FREQUENCY = 1 / 10;

/** Explicit visual ordering audited from the generated sprite palettes. */
const GRASS_VARIANTS: TerrainDepthVariants = {
    light: "plains.grass2",
    medium: "plains.grass1",
    dark: "plains.grass3",
};

/**
 * Grassland: the only biome so far. Matches unconditionally, so it must stay
 * last once other biomes exist to match ahead of it.
 */
export class PlainsBiome extends Biome {
    public readonly name = "plains";

    private readonly grassVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's fields sample deterministically.
     * @param terrainDepthConfig - Shared biome-interior depth tuning.
     */
    public constructor(worldSeed: number, private readonly terrainDepthConfig: TerrainDepthConfig = TERRAIN_DEPTH_CONFIG) {
        super();
        this.grassVariantField = new ValueNoiseField("grass_variant", worldSeed, GRASS_VARIANT_SEED_OFFSET, GRASS_VARIANT_FREQUENCY);
    }

    public override getFields(): readonly NoiseField[] {
        return [this.grassVariantField];
    }

    public override matches(climate: ClimateSample): boolean {
        void climate;
        return true;
    }

    /** Selects progressively darker grass bands while retaining world-space variation. */
    public override sampleBaseTerrain(worldX: number, worldY: number, biomeDepth: number): BackgroundTileType {
        const value = this.grassVariantField.sample(worldX, worldY);
        return selectTerrainVariant(value, biomeDepth, GRASS_VARIANTS, this.terrainDepthConfig);
    }
}

