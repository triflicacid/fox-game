import type {BiomeTag} from "./biome/biome";
import type {NoiseFieldRegistry} from "./field-registry";
import type {Structure} from "./structure/structure";

/** Main-thread generation queries required by the running world. */
export interface TerrainGenerationSource {
    /** Rebuilds seed-dependent generation state. */
    setSeed(worldSeed: number): void;

    /** Resolves the biome at a world tile position. */
    resolveBiomeTagAt(worldX: number, worldY: number): BiomeTag;

    /** Returns every structure type placed by generation. */
    getStructures(): readonly Structure[];

    /** Returns the named generation fields. */
    getFields(): NoiseFieldRegistry;
}


