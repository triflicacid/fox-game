import {BackgroundTileType} from "../../../sprites/background-tile-sprite-sheet";
import {Biome} from "./biome";
import {ClimateSample} from "./climate-fields";
import {NoiseField, ValueNoiseField} from "../noise-field";
import {selectTerrainVariant, TERRAIN_DEPTH_CONFIG, TerrainDepthConfig, TerrainDepthVariants} from "./terrain-depth";

/** Forest climate and terrain-variation tuning. First-guess values, not yet tuned. */
const FOREST_CONFIG = {
    /** Forest is cool and moist - the opposite corner of the climate space from Desert. */
    maximumTemperature: 0.52,
    minimumMoisture: 0.58,

    treeVariantSeedOffset: 7079,
    /** Noise cycles per tile: one lattice cell spans 10 tiles. */
    treeVariantFrequency: 1 / 10,
} as const;

/** Explicit visual ordering audited from the generated sprite palettes. */
const FOREST_VARIANTS: TerrainDepthVariants = {
    light: "forest2",
    medium: "forest1",
    dark: "forest3",
};

/** Cool, moist terrain selected before the catch-all Plains biome. */
export class ForestBiome extends Biome {
    public readonly name = "forest";

    private readonly treeVariantField: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this biome's terrain samples deterministically.
     * @param terrainDepthConfig - Shared biome-interior depth tuning.
     */
    public constructor(worldSeed: number, private readonly terrainDepthConfig: TerrainDepthConfig = TERRAIN_DEPTH_CONFIG) {
        super();
        this.treeVariantField = new ValueNoiseField(
            "tree_variant",
            worldSeed,
            FOREST_CONFIG.treeVariantSeedOffset,
            FOREST_CONFIG.treeVariantFrequency,
        );
    }

    public override getFields(): readonly NoiseField[] {
        return [this.treeVariantField];
    }

    public override matches(climate: ClimateSample): boolean {
        return climate.temperature <= FOREST_CONFIG.maximumTemperature
            && climate.moisture >= FOREST_CONFIG.minimumMoisture;
    }

    /** Selects progressively darker forest-floor bands while retaining world-space variation. */
    public override sampleBaseTerrain(worldX: number, worldY: number, biomeDepth: number): BackgroundTileType {
        const value = this.treeVariantField.sample(worldX, worldY);
        return selectTerrainVariant(value, biomeDepth, FOREST_VARIANTS, this.terrainDepthConfig);
    }
}
