import {BackgroundTileType} from "../../../sprites/BackgroundTileSpriteSheet";
import {Biome} from "./biome";
import {ClimateSample} from "./climate-fields";
import {NoiseField, ValueNoiseField} from "../noise-field";
import {selectTerrainVariant, TERRAIN_DEPTH_CONFIG, TerrainDepthConfig, TerrainDepthVariants} from "./terrain-depth";

/** Desert climate and terrain-variation tuning. */
const DESERT_CONFIG = {
    /** Desert is hot and dry. */
    minimumTemperature: 0.48,
    maximumMoisture: 0.58,

    sandVariantSeedOffset: 6067,
    /** Noise cycles per tile: one lattice cell spans 10 tiles. */
    sandVariantFrequency: 1 / 10,
} as const;

const SAND_VARIANTS: TerrainDepthVariants = {
    light: "sand1",
    medium: "sand2",
    dark: "sand3",
};

/** Hot, dry terrain selected before the catch-all Plains biome. */
export class DesertBiome extends Biome {
    public readonly name = "desert";

    private readonly sandVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's terrain samples deterministically.
     * @param terrainDepthConfig - Shared biome-interior depth tuning.
     */
    public constructor(worldSeed: number, private readonly terrainDepthConfig: TerrainDepthConfig = TERRAIN_DEPTH_CONFIG) {
        super();
        this.sandVariantField = new ValueNoiseField(
            "sand_variant",
            worldSeed,
            DESERT_CONFIG.sandVariantSeedOffset,
            DESERT_CONFIG.sandVariantFrequency,
        );
    }

    public override getFields(): readonly NoiseField[] {
        return [this.sandVariantField];
    }

    public override matches(climate: ClimateSample): boolean {
        return climate.temperature >= DESERT_CONFIG.minimumTemperature
            && climate.moisture <= DESERT_CONFIG.maximumMoisture;
    }

    /** Selects progressively darker sand bands while retaining world-space variation. */
    public override sampleBaseTerrain(worldX: number, worldY: number, biomeDepth: number): BackgroundTileType {
        const value = this.sandVariantField.sample(worldX, worldY);
        return selectTerrainVariant(value, biomeDepth, SAND_VARIANTS, this.terrainDepthConfig);
    }
}

