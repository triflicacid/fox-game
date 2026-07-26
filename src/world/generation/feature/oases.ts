import {CHUNK_SIZE} from "../../chunk-size";
import {TileData} from "../../tile";
import {BiomeTag} from "../biome/biome";
import {BiomeTagResolver, Feature, TerrainResampler} from "./feature";
import {FbmField, NoiseField} from "../noise-field";
import {CoordMap, CoordSet, ReadonlyCoordSet} from "../../coord-set";
import {
    computeEdgeDistances,
    computeOutwardDistances,
    erodeComponent,
    findCoreTiles,
    floodFill8,
} from "../grid-algorithms";
import {TerrainDepthConfig} from "../biome/terrain-depth";

// first-guess values; tune with the debug visualiser and a documented fixed-seed sample
const OASIS_CONFIG = {
    oasisRegionSeedOffset: 7013,
    oasisRegionFrequency: 1 / 300, // broad: eligible zones are uncommon globally
    oasisRegionThreshold: 0.64, // upper portion of broad FBM hills pass

    oasisShapeSeedOffset: 8059,
    oasisShapeFrequency: 1 / 40, // broader than lakes; accepted bodies are larger
    oasisShapeThreshold: 0.45,

    fieldOctaves: 2,

    minSize: 25, // larger than lake minimum: only substantial bodies are accepted
    smoothingNeighbourThreshold: 4, // less aggressive than lakes to preserve larger interiors
    smoothingPasses: 2,

    deepWaterThresholdAtShore: 0.75,
    deepWaterThresholdAtCenter: 0.65,
    centerRingDepth: 5,

    shoreGrassPerturbationTiles: 3,
    maxTiles: 30 * CHUNK_SIZE * CHUNK_SIZE, // larger cap than lakes

    requiredBiome: ["desert"] as readonly BiomeTag[],
} as const;

interface OasisComponent {
    tiles: ReadonlyCoordSet;
    coreTiles: ReadonlyCoordSet;
}

/**
 * rare Desert water bodies using two dedicated noise fields and turquoise sprites,
 * so oasis rarity does not weaken the shared climate model
 */
export class OasisFeature extends Feature {
    private readonly oasisRegion: NoiseField;
    private readonly oasisShape: NoiseField;

    /**
     * @param worldSeed - world seed
     * @param terrainDepth - shared depth tuning; maximumDepthTiles is used as the shore-grass BFS radius
     */
    public constructor(worldSeed: number, private readonly terrainDepth: TerrainDepthConfig) {
        super();
        this.oasisRegion = new FbmField(
            "oasis_region",
            worldSeed,
            OASIS_CONFIG.oasisRegionSeedOffset,
            OASIS_CONFIG.oasisRegionFrequency,
            OASIS_CONFIG.fieldOctaves,
        );
        this.oasisShape = new FbmField(
            "oasis_shape",
            worldSeed,
            OASIS_CONFIG.oasisShapeSeedOffset,
            OASIS_CONFIG.oasisShapeFrequency,
            OASIS_CONFIG.fieldOctaves,
        );
    }

    public override getFields(): readonly NoiseField[] {
        return [this.oasisRegion, this.oasisShape];
    }

    public override getPermittedBiomes(): readonly BiomeTag[] {
        return OASIS_CONFIG.requiredBiome;
    }

    public override apply(
        tiles: TileData[][],
        chunkX: number,
        chunkY: number,
        resolveBiomeTagAt: BiomeTagResolver,
        resampleTerrainAt: TerrainResampler,
    ): void {
        const components = this.discoverComponents(resolveBiomeTagAt, chunkX, chunkY);

        const allOasisTiles = new CoordSet();
        for (const component of components) {
            for (const [x, y] of component.tiles) {
                allOasisTiles.add(x, y);
            }
        }

        for (const component of components) {
            const edgeDistances = computeEdgeDistances(component.tiles);
            const outwardDistances = computeOutwardDistances(
                component.tiles,
                allOasisTiles,
                this.terrainDepth.maximumDepthTiles,
            );

            for (const [worldX, worldY] of component.tiles) {
                const localX = worldX - chunkX * CHUNK_SIZE;
                const localY = worldY - chunkY * CHUNK_SIZE;
                if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
                    continue;
                }
                const tile = tiles[localY][localX];

                // lake wins on Plains tiles; oasis wins on Desert tiles
                if ((tile.featureTag === "lake:shallow" || tile.featureTag === "lake:deep")
                    && tile.biomeTag !== "desert") {
                    continue;
                }

                const edgeDistance = edgeDistances.get(worldX, worldY) as number;
                const isEdge = edgeDistance === 1;
                const threshold = OasisFeature.deepWaterThreshold(edgeDistance);
                const isDeep = !isEdge && this.oasisShape.sample(worldX, worldY) >= threshold;
                tile.groundType = isDeep ? "oasisWaterDark" : "oasisWaterLight";
                tile.featureTag = isDeep ? "oasis:deep" : "oasis:shallow";
            }

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
                const shoreNoise = this.oasisShape.sample(worldX, worldY);
                const jitter = (shoreNoise - 0.5) * 2 * OASIS_CONFIG.shoreGrassPerturbationTiles;
                const perturbedDist = Math.max(1, outwardDist + jitter);
                const effectiveDepth = Math.min(tile.biomeDepth, perturbedDist);
                tile.groundType = resampleTerrainAt(worldX, worldY, effectiveDepth);
            }
        }
    }

    /**
     * @param shoreDistance - distance from the oasis shore in 8-connected rings (1 at the shore)
     * @returns oasis_shape threshold interpolated from shore to center
     */
    /**
     * @param shoreDistance - distance from the oasis shore in 8-connected rings (1 at the shore)
     * @returns oasis_shape threshold interpolated from shore to center
     */
    private static deepWaterThreshold(shoreDistance: number): number {
        const centrality = Math.min(1, (shoreDistance - 1) / (OASIS_CONFIG.centerRingDepth - 1));
        return OASIS_CONFIG.deepWaterThresholdAtShore
            - centrality * (OASIS_CONFIG.deepWaterThresholdAtShore - OASIS_CONFIG.deepWaterThresholdAtCenter);
    }

    /**
     * @param worldX - tile X in world tiles
     * @param worldY - tile Y in world tiles
     * @returns whether both oasis fields clear their thresholds at this position
     */
    private isCandidate(worldX: number, worldY: number): boolean {
        return this.oasisRegion.sample(worldX, worldY) >= OASIS_CONFIG.oasisRegionThreshold
            && this.oasisShape.sample(worldX, worldY) >= OASIS_CONFIG.oasisShapeThreshold;
    }

    /**
     * discovers every oasis component touching the given chunk
     *
     * @param resolveBiomeTagAt - resolves the biome tag at an absolute world position
     * @param chunkX - chunk X coordinate in chunk units
     * @param chunkY - chunk Y coordinate in chunk units
     * @returns accepted oasis components touching this chunk (usually 0, very rarely 1)
     */
    private discoverComponents(
        resolveBiomeTagAt: BiomeTagResolver,
        chunkX: number,
        chunkY: number,
    ): OasisComponent[] {
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
        const components: OasisComponent[] = [];

        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkX * CHUNK_SIZE + localX;
                const worldY = chunkY * CHUNK_SIZE + localY;
                if (visited.has(worldX, worldY) || !isCandidateCached(worldX, worldY)) {
                    continue;
                }

                const {tiles: raw, exceededCap} = floodFill8(
                    worldX, worldY, isCandidateCached, OASIS_CONFIG.maxTiles,
                );
                for (const [x, y] of raw) {
                    visited.add(x, y);
                }
                if (exceededCap) {
                    continue;
                }

                let smoothed: CoordSet = raw;
                for (let pass = 0; pass < OASIS_CONFIG.smoothingPasses; pass++) {
                    smoothed = erodeComponent(smoothed, OASIS_CONFIG.smoothingNeighbourThreshold);
                }
                if (smoothed.size < OASIS_CONFIG.minSize) {
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





