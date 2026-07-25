import {FbmField, NoiseField} from "./noise-field";

/** Shared world-climate fields consumed by biomes and terrain features. */
export interface ClimateFields {
    readonly moisture: NoiseField;
    readonly temperature: NoiseField;
}

const CLIMATE_CONFIG = {
    /** Preserved from the original lake-owned moisture field. */
    moistureSeedOffset: 2027,
    moistureFrequency: 1 / 50,

    /** Independent broad-scale temperature channel. */
    temperatureSeedOffset: 5051,
    temperatureFrequency: 1 / 100,

    fieldOctaves: 2,
} as const;

/** Creates one shared set of climate fields for a world seed. */
export function createClimateFields(worldSeed: number): ClimateFields {
    return {
        moisture: new FbmField(
            "moisture",
            worldSeed,
            CLIMATE_CONFIG.moistureSeedOffset,
            CLIMATE_CONFIG.moistureFrequency,
            CLIMATE_CONFIG.fieldOctaves,
        ),
        temperature: new FbmField(
            "temperature",
            worldSeed,
            CLIMATE_CONFIG.temperatureSeedOffset,
            CLIMATE_CONFIG.temperatureFrequency,
            CLIMATE_CONFIG.fieldOctaves,
        ),
    };
}

