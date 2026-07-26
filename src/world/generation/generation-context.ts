import {ClimateFields} from "./biome/climate-fields";
import {TerrainDepthConfig} from "./biome/terrain-depth";

/** Shared, immutable dependencies available while constructing world generators. */
export interface GenerationContext {
    readonly worldSeed: number;
    readonly climate: ClimateFields;
    readonly terrainDepth: TerrainDepthConfig;
}
