import {BackgroundTileType} from "../../sprites/BackgroundTileSpriteSheet";
import {Biome} from "./biome";
import {NoiseField, ValueNoiseField} from "./noise-field";

/** Per-channel seed offset for grass variety. */
const GRASS_VARIANT_SEED_OFFSET = 1013;

/** Noise cycles per tile for grass variety: one lattice cell spans 10 tiles. */
const GRASS_VARIANT_FREQUENCY = 1 / 10;

/** Grass variants, in ascending order of the noise band that selects them. */
const GRASS_VARIANTS: readonly BackgroundTileType[] = ["grass1", "grass2", "grass3"];

/**
 * Grassland: the only biome so far. Matches unconditionally, so it must stay
 * last once other biomes exist to match ahead of it.
 */
export class PlainsBiome extends Biome {
    public readonly name = "plains";

    private readonly grassVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's fields sample deterministically.
     */
    public constructor(worldSeed: number) {
        super();
        this.grassVariantField = new ValueNoiseField("grass_variant", worldSeed, GRASS_VARIANT_SEED_OFFSET, GRASS_VARIANT_FREQUENCY);
    }

    public override getFields(): readonly NoiseField[] {
        return [this.grassVariantField];
    }

    public override matches(): boolean {
        return true;
    }

    /**
     * Bands {@link grassVariantField} into {@link GRASS_VARIANTS}.length equal
     * parts.
     */
    public override sampleBaseTerrain(worldX: number, worldY: number): BackgroundTileType {
        const value = this.grassVariantField.sample(worldX, worldY);
        const index = Math.min(GRASS_VARIANTS.length - 1, Math.floor(value * GRASS_VARIANTS.length));
        return GRASS_VARIANTS[index];
    }
}
