import {CHUNK_SIZE} from "../../chunk-size";
import {TileData} from "../../tile";
import {BiomeTag} from "../biome/biome";
import {BiomeTagResolver, Feature, TerrainResampler} from "./feature";
import {FbmField, NoiseField} from "../noise-field";
import {ReadonlyCoordSet, CoordMap, CoordSet} from "../../coord-set";
import {computeEdgeDistances, computeOutwardDistances, erodeComponent, findCoreTiles, floodFill8} from "../grid-algorithms";
import {TerrainDepthConfig} from "../biome/terrain-depth";

/** Every tunable lake-generation value, grouped so they're tuned in one place. */
const LAKE_CONFIG = {
    /** Per-channel seed offsets so the two lake-owned fields don't correlate. */
    wetnessSeedOffset: 3037,
    lakeShapeSeedOffset: 4049,

    /** Noise cycles per tile: wetness is a broad gate, lake_shape carves the blob. */
    wetnessFrequency: 1 / 45,
    lakeShapeFrequency: 1 / 20,

    /** Octaves per field - avoids single-lattice-cell "isolated spike" artifacts at a high threshold. */
    fieldOctaves: 2,

    /** A tile must clear all three thresholds to be lake-candidate. First-guess values, not yet tuned. */
    moistureThreshold: 0.5,
    wetnessThreshold: 0.5,
    lakeShapeThreshold: 0.62,

    /** Below this many tiles (after smoothing), a component is discarded as too small to read as a lake. */
    minSize: 6,

    /** Neighbour-count threshold {@link erodeComponent} uses to erode a lake's raw shape. */
    smoothingNeighbourThreshold: 5,

    /** Erosion passes - iterating rounds off blockier edges a single pass leaves. First-guess value, not yet tuned. */
    smoothingPasses: 2,

    /** `lake_shape` value a tile one ring in from the shore must clear to render as dark/deep water; a shore tile itself is never dark. First-guess value, not yet tuned. */
    deepWaterThresholdAtShore: 0.75,

    /** `lake_shape` value a tile at/beyond `centerRingDepth` rings from the shore must clear to render dark - lower than the shore threshold but still above `lakeShapeThreshold`, so noise variation still reads as patchy shallows even well inside a lake. First-guess value, not yet tuned. */
    deepWaterThresholdAtCenter: 0.68,

    /** Shore distance (8-connected rings) at which `deepWaterThresholdAtCenter` fully applies; the threshold interpolates linearly between the shore and this depth. */
    centerRingDepth: 4,

    /**
     * Half-range of the per-tile noise jitter applied to the outward shore distance before
     * it is used as an effective depth. Breaks up the geometric BFS contour so the light-grass
     * ring dissolves organically rather than forming a visible rounded rectangle.
     * Uses the `lake_shape` field so no extra noise sampling is needed.
     */
    shoreGrassPerturbationTiles: 3,

    /** Hard cap on one lake's tile count, sized in chunk units so it tracks `CHUNK_SIZE`. */
    maxTiles: 9 * CHUNK_SIZE * CHUNK_SIZE,

    /** Biomes a lake is allowed to centre in (majority vote of its core tiles) - extensible for a future Desert oasis exception. */
    allowedBiomes: ["plains"] as readonly BiomeTag[],
} as const;


/** One accepted lake, ready to paint. */
interface LakeComponent {
    /** Every tile the lake covers. */
    tiles: ReadonlyCoordSet;
    /** The subset of {@link tiles} used for the biome vote - see {@link findCoreTiles}. */
    coreTiles: ReadonlyCoordSet;
}

/** Lakes: a region-style feature - flood-filled, smoothed, min-size and biome-vote gated. */
export class LakeFeature extends Feature {
    private readonly wetness: NoiseField;
    private readonly lakeShape: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this feature's fields sample deterministically.
     * @param moisture - The shared world moisture field.
     * @param terrainDepth - Shared terrain-depth tuning; its `maximumDepthTiles` is used as
     *   the shore-grass BFS radius so the banding dissolves naturally into the surrounding
     *   biome-depth pattern rather than stopping at a hard geometric ring.
     */
    public constructor(
        worldSeed: number,
        private readonly moisture: NoiseField,
        private readonly terrainDepth: TerrainDepthConfig,
    ) {
        super();
        this.wetness = new FbmField("wetness", worldSeed, LAKE_CONFIG.wetnessSeedOffset, LAKE_CONFIG.wetnessFrequency, LAKE_CONFIG.fieldOctaves);
        this.lakeShape = new FbmField("lake_shape", worldSeed, LAKE_CONFIG.lakeShapeSeedOffset, LAKE_CONFIG.lakeShapeFrequency, LAKE_CONFIG.fieldOctaves);
    }

    public override getFields(): readonly NoiseField[] {
        return [this.wetness, this.lakeShape];
    }

    public override getPermittedBiomes(): readonly BiomeTag[] {
        return LAKE_CONFIG.allowedBiomes;
    }

    public override apply(tiles: TileData[][], chunkX: number, chunkY: number, resolveBiomeTagAt: BiomeTagResolver, resampleTerrainAt: TerrainResampler): void {
        const components = this.discoverComponents(resolveBiomeTagAt, chunkX, chunkY);

        // Union of all lake tiles across all components; used as the barrier for outward BFS.
        const allLakeTiles = new CoordSet();
        for (const component of components) {
            for (const [x, y] of component.tiles) {
                allLakeTiles.add(x, y);
            }
        }

        for (const component of components) {
            const edgeDistances = computeEdgeDistances(component.tiles);
            const outwardDistances = computeOutwardDistances(
                component.tiles,
                allLakeTiles,
                this.terrainDepth.maximumDepthTiles,
            );

            // Paint water tiles.
            for (const [worldX, worldY] of component.tiles) {
                const localX = worldX - chunkX * CHUNK_SIZE;
                const localY = worldY - chunkY * CHUNK_SIZE;
                if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
                    continue;
                }
                const edgeDistance = edgeDistances.get(worldX, worldY) as number;
                // A shore tile (any neighbour outside the lake) is never dark, regardless of threshold.
                const isEdge = edgeDistance === 1;
                const threshold = LakeFeature.deepWaterThreshold(edgeDistance);
                const isDeep = !isEdge && this.lakeShape.sample(worldX, worldY) >= threshold;
                tiles[localY][localX].groundType = isDeep ? "waterDark" : "waterLight";
                tiles[localY][localX].featureTag = isDeep ? "lake:deep" : "lake:shallow";
            }

            // Apply shore-grass banding: lighten surrounding land tiles proportional to shore proximity.
            for (const [worldX, worldY] of outwardDistances.keys()) {
                const outwardDist = outwardDistances.get(worldX, worldY) as number;
                const localX = worldX - chunkX * CHUNK_SIZE;
                const localY = worldY - chunkY * CHUNK_SIZE;
                if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
                    continue;
                }
                const tile = tiles[localY][localX];
                if (tile.featureTag !== "none") {
                    continue;
                }
                // Perturb the outward distance with world-space noise so the BFS's
                // geometric contour dissolves into an organic edge instead of a rectangle.
                const shoreNoise = this.lakeShape.sample(worldX, worldY);
                const jitter = (shoreNoise - 0.5) * 2 * LAKE_CONFIG.shoreGrassPerturbationTiles;
                const perturbedDist = Math.max(1, outwardDist + jitter);
                const effectiveDepth = Math.min(tile.biomeDepth, perturbedDist);
                tile.groundType = resampleTerrainAt(worldX, worldY, effectiveDepth);
            }
        }
    }

    /**
     * The `lake_shape` threshold a tile at the given shore distance must
     * clear to render dark - interpolated between
     * `LAKE_CONFIG.deepWaterThresholdAtShore` and
     * `LAKE_CONFIG.deepWaterThresholdAtCenter` over
     * `LAKE_CONFIG.centerRingDepth` rings.
     *
     * @param shoreDistance - Tile's distance from the shore, in 8-connected rings (1 at the shore).
     * @returns The `lake_shape` threshold at that shore distance.
     */
    private static deepWaterThreshold(shoreDistance: number): number {
        const centrality = Math.min(1, (shoreDistance - 1) / (LAKE_CONFIG.centerRingDepth - 1));
        return LAKE_CONFIG.deepWaterThresholdAtShore
            - centrality * (LAKE_CONFIG.deepWaterThresholdAtShore - LAKE_CONFIG.deepWaterThresholdAtCenter);
    }

    /**
     * Whether the given absolute world tile clears all three lake fields'
     * thresholds. Pure per-tile check, no biome involved.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns Whether this tile is lake-candidate.
     */
    private isCandidate(worldX: number, worldY: number): boolean {
        return this.moisture.sample(worldX, worldY) >= LAKE_CONFIG.moistureThreshold
            && this.wetness.sample(worldX, worldY) >= LAKE_CONFIG.wetnessThreshold
            && this.lakeShape.sample(worldX, worldY) >= LAKE_CONFIG.lakeShapeThreshold;
    }


    /**
     * Discovers every lake touching the chunk at `(chunkX, chunkY)`: floods
     * out from each candidate tile local to the chunk (candidacy memoised
     * per call), then smooths, min-size checks, core-tiles, and
     * biome-votes each surviving component.
     *
     * @param resolveBiomeTagAt - Resolves the biome tag at an absolute world position.
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns Every accepted lake touching this chunk (usually 0 or 1).
     */
    private discoverComponents(resolveBiomeTagAt: BiomeTagResolver, chunkX: number, chunkY: number): LakeComponent[] {
        // cache results
        const candidacyCache = new CoordMap<boolean>();
        const isCandidateCached = (worldX: number, worldY: number): boolean => {
            let cached = candidacyCache.get(worldX, worldY);
            if (cached === undefined) {
                cached = this.isCandidate(worldX, worldY);
                candidacyCache.set(worldX, worldY, cached);
            }
            return cached;
        };

        const visited = new CoordSet();
        const components: LakeComponent[] = [];

        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkX * CHUNK_SIZE + localX;
                const worldY = chunkY * CHUNK_SIZE + localY;
                if (visited.has(worldX, worldY) || !isCandidateCached(worldX, worldY)) {
                    continue;
                }

                const {tiles: raw, exceededCap} = floodFill8(worldX, worldY, isCandidateCached, LAKE_CONFIG.maxTiles);
                for (const [x, y] of raw) {
                    visited.add(x, y);
                }
                if (exceededCap) {
                    continue;
                }

                let smoothed: CoordSet = raw;
                for (let pass = 0; pass < LAKE_CONFIG.smoothingPasses; pass++) {
                    smoothed = erodeComponent(smoothed, LAKE_CONFIG.smoothingNeighbourThreshold);
                }
                if (smoothed.size < LAKE_CONFIG.minSize) {
                    continue;
                }

                const coreTiles = findCoreTiles(smoothed);
                if (coreTiles.size === 0) {
                    continue;
                }

                if (!this.coreTilesBiomeAllowed(coreTiles, resolveBiomeTagAt)) {
                    continue;
                }

                components.push({tiles: smoothed, coreTiles});
            }
        }

        return components;
    }
}

