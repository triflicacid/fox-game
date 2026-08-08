import {BackgroundTileType} from "../../../sprites/BackgroundTileSpriteSheet";
import {Biome} from "./biome";
import {ClimateSample} from "./climate-fields";
import {NoiseField, ValueNoiseField} from "../noise-field";
import {selectTerrainVariant, TERRAIN_DEPTH_CONFIG, TerrainDepthConfig, TerrainDepthVariants} from "./terrain-depth";

/**
 * Tundra climate and terrain-variation tuning. First-guess values, not yet
 * tuned.
 */
const TUNDRA_CONFIG = {
    /** Strict "<", not "<=" - stays clear of Forest's own `moisture >= 0.58` boundary with room to spare. */
    maximumMoisture: 0.35,
    /** Strict "<" - stays clear of Desert's own `temperature >= 0.48` boundary with room to spare. */
    maximumTemperature: 0.35,

    /**
     * Moisture at/above which a Tundra tile reads as icy rather than
     * barren - splits Tundra's own moisture band roughly at its midpoint.
     */
    wetnessThreshold: 0.18,

    terrainVariantSeedOffset: 8081,
    /** Noise cycles per tile: one lattice cell spans 10 tiles, matching Desert/Forest. */
    terrainVariantFrequency: 1 / 10,
} as const;

/** Exposed, wind-scoured ground - the drier side of Tundra's moisture split. */
const BARREN_VARIANTS: TerrainDepthVariants = {
    light: "tundra.barren.light",
    medium: "tundra.barren.medium",
    dark: "tundra.barren.dark",
};

/** Frost/ice-glazed ground - the wetter side. Shares its medium tile with barren; the two palettes converge there. */
const ICY_VARIANTS: TerrainDepthVariants = {
    light: "tundra.icy.light",
    medium: "tundra.barren.medium",
    dark: "tundra.icy.dark",
};

/**
 * Cold, dry terrain.
 */
export class TundraBiome extends Biome {
    public readonly name = "tundra";

    private readonly terrainVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's terrain samples deterministically.
     * @param moisture - The generator's shared `ClimateFields.moisture` field, resampled per-tile to pick icy vs. barren without threading `ClimateSample` through `sampleBaseTerrain`.
     * @param terrainDepthConfig - Shared biome-interior depth tuning.
     */
    public constructor(
        worldSeed: number,
        private readonly moisture: NoiseField,
        private readonly terrainDepthConfig: TerrainDepthConfig = TERRAIN_DEPTH_CONFIG,
    ) {
        super();
        this.terrainVariantField = new ValueNoiseField(
            "tundra_variant",
            worldSeed,
            TUNDRA_CONFIG.terrainVariantSeedOffset,
            TUNDRA_CONFIG.terrainVariantFrequency,
        );
    }

    public override getFields(): readonly NoiseField[] {
        return [this.terrainVariantField];
    }

    public override matches(climate: ClimateSample): boolean {
        return climate.moisture < TUNDRA_CONFIG.maximumMoisture
            && climate.temperature < TUNDRA_CONFIG.maximumTemperature;
    }

    /** Selects progressively paler/icier bands, picking the icy or barren palette from the resampled moisture field. */
    public override sampleBaseTerrain(worldX: number, worldY: number, biomeDepth: number): BackgroundTileType {
        const value = this.terrainVariantField.sample(worldX, worldY);
        const variants = this.moisture.sample(worldX, worldY) >= TUNDRA_CONFIG.wetnessThreshold
            ? ICY_VARIANTS
            : BARREN_VARIANTS;
        return selectTerrainVariant(value, biomeDepth, variants, this.terrainDepthConfig);
    }
}
