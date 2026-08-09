import {BiomeTag} from "./biome";

/**
 * Flat fill colour per {@link BiomeTag}, for the minimap's biome-overview layer.
 */
export const BIOME_COLORS: Record<BiomeTag, readonly [number, number, number]> = {
    plains: [139, 191, 95], // grassy yellow-green
    desert: [224, 196, 140], // sandy tan
    forest: [43, 100, 56], // deep pine green
    tundra: [210, 224, 226], // pale icy blue-white
};
