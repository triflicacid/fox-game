import {TileData} from "../../tile";
import {BackgroundTileType} from "../../../sprites/BackgroundTileSpriteSheet";
import {BiomeTag} from "../biome/biome";
import {GenerationContext} from "../generation-context";
import {NoiseField} from "../noise-field";

/** Resolves the retained or sampled biome tag at an arbitrary world position. */
export type BiomeTagResolver = (worldX: number, worldY: number) => BiomeTag;

/**
 * Re-samples base terrain for a world position at an explicit effective depth,
 * letting features apply depth-driven banding to surrounding land tiles.
 */
export type TerrainResampler = (worldX: number, worldY: number, depth: number) => BackgroundTileType;

/** Builds a `Feature` from the shared world-generation context. */
export type FeatureProvider = (context: GenerationContext) => Feature;

/**
 * A discrete world feature (lakes, rivers, ...) applied on top of base
 * terrain. Owns whatever fields/parameters its own candidacy needs.
 */
export abstract class Feature {
    /**
     * Every `NoiseField` owned by this feature. Shared climate fields are
     * registered separately by `ChunkGenerator`.
     *
     * @returns This feature's owned fields.
     */
    public abstract getFields(): readonly NoiseField[];

    /**
     * Applies this feature onto `tiles`, mutating whichever local tiles it
     * covers within the chunk at `(chunkX, chunkY)`.
     *
     * @param tiles - The chunk's mutable, not-yet-finalized tile grid, indexed `[localY][localX]`.
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @param resolveBiomeTagAt - Resolves the biome tag at an absolute world position.
     * @param resampleTerrainAt - Re-samples base terrain at an absolute world position with an explicit effective depth.
     */
    public abstract apply(
        tiles: TileData[][],
        chunkX: number,
        chunkY: number,
        resolveBiomeTagAt: BiomeTagResolver,
        resampleTerrainAt: TerrainResampler,
    ): void;
}
