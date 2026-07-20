import {TileData} from "../tile";
import {Biome} from "./biome";
import {NoiseField} from "./noise-field";

/** Resolves which biome applies at an arbitrary world position. */
export type BiomeResolver = (worldX: number, worldY: number) => Biome;

/** Builds a `Feature` instance for a given world seed. */
export type FeatureProvider = (worldSeed: number) => Feature;

/**
 * A discrete world feature (lakes, rivers, ...) applied on top of base
 * terrain. Owns whatever fields/parameters its own candidacy needs.
 */
export abstract class Feature {
    /**
     * Every `NoiseField` this feature samples from.
     *
     * @returns This feature's fields.
     */
    public abstract getFields(): readonly NoiseField[];

    /**
     * Applies this feature onto `tiles`, mutating whichever local tiles it
     * covers within the chunk at `(chunkX, chunkY)`.
     *
     * @param tiles - The chunk's mutable, not-yet-finalized tile grid, indexed `[localY][localX]`.
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @param resolveBiomeAt - Resolves the biome at an absolute world position.
     */
    public abstract apply(tiles: TileData[][], chunkX: number, chunkY: number, resolveBiomeAt: BiomeResolver): void;
}
