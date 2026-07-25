import {BackgroundTileType} from "../../sprites/BackgroundTileSpriteSheet";
import {Biome} from "./biome";
import {ClimateSample} from "./climate-fields";
import {NoiseField, ValueNoiseField} from "./noise-field";

/** Desert climate and terrain-variation tuning. */
const DESERT_CONFIG = {
    /** Desert is hot and dry. */
    minimumTemperature: 0.48,
    maximumMoisture: 0.58,

    sandVariantSeedOffset: 6067,
    /** Noise cycles per tile: one lattice cell spans 10 tiles. */
    sandVariantFrequency: 1 / 10,
} as const;

/** Sand variants, in ascending order of the noise band that selects them. */
const SAND_VARIANTS: readonly BackgroundTileType[] = ["sand1", "sand2", "sand3"];

/** Hot, dry terrain selected before the catch-all Plains biome. */
export class DesertBiome extends Biome {
    public readonly name = "desert";

    private readonly sandVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's terrain samples deterministically.
     */
    public constructor(worldSeed: number) {
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

    /** Bands the world-space variant field into the three sand sprites. */
    public override sampleBaseTerrain(worldX: number, worldY: number): BackgroundTileType {
        const value = this.sandVariantField.sample(worldX, worldY);
        const index = Math.min(SAND_VARIANTS.length - 1, Math.floor(value * SAND_VARIANTS.length));
        return SAND_VARIANTS[index];
    }
}
