import {TileData} from "../../tiles/tile";
import {BackgroundTileType} from "../../../sprites/background-tile-sprite-sheet";
import {BiomeTag} from "../biome/biome";
import {GenerationContext} from "../generation-context";
import {NoiseField} from "../noise-field";
import {ReadonlyCoordSet} from "../../coordinates/coord-set";

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
     * biome tags a component's core-tile majority vote must match to be accepted
     *
     * @returns permitted biome tags for this feature's components
     */
    public abstract getPermittedBiomes(): readonly BiomeTag[];

    /**
     * Whether this feature's own fields consider `(worldX, worldY)` a
     * candidate site, independent of component discovery/acceptance - a
     * cheap, per-tile, always-consistent over-approximation (a candidate
     * tile isn't guaranteed to end up part of an accepted component, but
     * every accepted component's tiles are always candidates). Lets other
     * systems (e.g. `Structure`) conservatively avoid tiles this feature
     * might turn into water, without redoing full component discovery.
     * Defaults to never a candidate.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns Whether this feature considers the position a candidate site.
     */
    public isCandidateSite(worldX: number, worldY: number): boolean {
        void worldX;
        void worldY;
        return false;
    }

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

    /**
     * majority-votes the biome of coreTiles against this feature's permitted biomes
     *
     * @param coreTiles - interior tiles of a candidate component
     * @param resolveBiomeTagAt - resolves the biome tag at an absolute world position
     * @returns whether the majority biome of coreTiles is in getPermittedBiomes()
     */
    protected coreTilesBiomeAllowed(
        coreTiles: ReadonlyCoordSet,
        resolveBiomeTagAt: BiomeTagResolver,
    ): boolean {
        const permitted = this.getPermittedBiomes();
        const counts = new Map<BiomeTag, number>();
        for (const [x, y] of coreTiles) {
            const tag = resolveBiomeTagAt(x, y);
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        let majorityTag: BiomeTag | undefined;
        let majorityCount = -1;
        for (const [tag, count] of counts) {
            if (count > majorityCount) {
                majorityTag = tag;
                majorityCount = count;
            }
        }
        return majorityTag !== undefined && permitted.includes(majorityTag);
    }
}
