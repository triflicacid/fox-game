import {ClimateFields} from "./biome/climate-fields";

/** Shared, immutable dependencies available while constructing world generators. */
export interface GenerationContext {
    readonly worldSeed: number;
    readonly climate: ClimateFields;
}

