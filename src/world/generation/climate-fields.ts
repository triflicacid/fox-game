import {CHUNK_SIZE} from "../chunk-size";
import {FbmField, NoiseField} from "./noise-field";

/** Climate values sampled at one absolute world-tile position. */
export interface ClimateSample {
    readonly moisture: number;
    readonly temperature: number;
}

const CLIMATE_CONFIG = {
    /** Approximate broad climate scale in chunks; biome thresholds determine the final region sizes. */
    averageBiomeSizeChunks: 6.25,

    /** Preserved from the original lake-owned moisture field (0.5 * 100 tiles = 50 tiles). */
    moistureSeedOffset: 2027,
    moistureRelativeScale: 0.5,

    /** Independent broad-scale temperature channel. */
    temperatureSeedOffset: 5051,
    temperatureRelativeScale: 1,

    fieldOctaves: 2,
} as const;

/** Shared world-climate fields consumed by biomes and terrain features. */
export class ClimateFields {
    public readonly moisture: NoiseField;
    public readonly temperature: NoiseField;

    /**
     * @param worldSeed - The world's seed.
     */
    public constructor(worldSeed: number) {
        const averageBiomeSizeTiles = CLIMATE_CONFIG.averageBiomeSizeChunks * CHUNK_SIZE;
        this.moisture = new FbmField(
            "moisture",
            worldSeed,
            CLIMATE_CONFIG.moistureSeedOffset,
            1 / (averageBiomeSizeTiles * CLIMATE_CONFIG.moistureRelativeScale),
            CLIMATE_CONFIG.fieldOctaves,
        );
        this.temperature = new FbmField(
            "temperature",
            worldSeed,
            CLIMATE_CONFIG.temperatureSeedOffset,
            1 / (averageBiomeSizeTiles * CLIMATE_CONFIG.temperatureRelativeScale),
            CLIMATE_CONFIG.fieldOctaves,
        );
    }

    /** Samples every climate field at an absolute world-tile position. */
    public sample(worldX: number, worldY: number): ClimateSample {
        return {
            moisture: this.moisture.sample(worldX, worldY),
            temperature: this.temperature.sample(worldX, worldY),
        };
    }

    /** Returns every field owned by this climate. */
    public getFields(): readonly NoiseField[] {
        return [this.moisture, this.temperature];
    }
}
