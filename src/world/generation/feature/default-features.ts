import {FeatureProvider} from "./feature";
import {LakeFeature} from "./lakes";

/** Every feature a `ChunkGenerator` applies unless told otherwise. */
export const DEFAULT_FEATURE_PROVIDERS: readonly FeatureProvider[] = [
    ({worldSeed, climate, terrainDepth}) => new LakeFeature(worldSeed, climate.moisture, terrainDepth),
];
