import {FeatureProvider} from "./feature";
import {LakeFeature} from "./lakes";
import {OasisFeature} from "./oases";

/** Every feature a `ChunkGenerator` applies unless told otherwise. */
export const DEFAULT_FEATURE_PROVIDERS: readonly FeatureProvider[] = [
    ({worldSeed, climate, terrainDepth}) => new LakeFeature(worldSeed, climate.moisture, terrainDepth),
    ({worldSeed, terrainDepth}) => new OasisFeature(worldSeed, terrainDepth),
];
