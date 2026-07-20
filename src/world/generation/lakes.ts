import {CHUNK_SIZE} from "../chunk-size";
import {TileData} from "../tile";
import {BiomeResolver, Feature} from "./feature";
import {FbmField, NoiseField} from "./noise-field";
import {PositionCache} from "./position-cache";
import {coordinateKey, parseCoordinateKey} from "../coordinate-key";

/** Every tunable lake-generation value, grouped so they're tuned in one place. */
const LAKE_CONFIG = {
    /** Per-channel seed offsets so the three lake fields don't correlate. */
    moistureSeedOffset: 2027,
    wetnessSeedOffset: 3037,
    lakeShapeSeedOffset: 4049,

    /** Noise cycles per tile: moisture/wetness are broad wetness gates, lake_shape carves the blob. */
    moistureFrequency: 1 / 50,
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

    /** Neighbour-count threshold {@link smoothComponent} uses to erode a lake's raw shape. */
    smoothingNeighbourThreshold: 5,

    /** Erosion passes - iterating rounds off blockier edges a single pass leaves. First-guess value, not yet tuned. */
    smoothingPasses: 2,

    /** `lake_shape` value a tile one ring in from the shore must clear to render as dark/deep water; a shore tile itself is never dark. First-guess value, not yet tuned. */
    deepWaterThresholdAtShore: 0.75,

    /** `lake_shape` value a tile at/beyond `centerRingDepth` rings from the shore must clear to render dark - lower than the shore threshold but still above `lakeShapeThreshold`, so noise variation still reads as patchy shallows even well inside a lake. First-guess value, not yet tuned. */
    deepWaterThresholdAtCenter: 0.68,

    /** Shore distance (8-connected rings) at which `deepWaterThresholdAtCenter` fully applies; the threshold interpolates linearly between the shore and this depth. */
    centerRingDepth: 4,

    /** Hard cap on one lake's tile count, sized in chunk units so it tracks `CHUNK_SIZE`. */
    maxTiles: 9 * CHUNK_SIZE * CHUNK_SIZE,

    /** Biomes a lake is allowed to centre in (majority vote of its core tiles) - extensible for a future Desert oasis exception. */
    allowedBiomes: ["plains"] as readonly string[],
} as const;

/**
 * Erodes ragged edge tiles from `component`: a tile survives iff at least
 * `LAKE_CONFIG.smoothingNeighbourThreshold` of its 8 neighbours are also in
 * `component`.
 *
 * @param component - The tile set to smooth, as {@link coordinateKey} strings.
 * @returns The smoothed tile set - a subset of `component`, possibly empty.
 */
function smoothComponent(component: ReadonlySet<string>): Set<string> {
    const smoothed = new Set<string>();
    for (const key of component) {
        const [x, y] = parseCoordinateKey(key);
        let neighbourCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (component.has(coordinateKey(x + dx, y + dy))) {
                    neighbourCount++;
                }
            }
        }
        if (neighbourCount >= LAKE_CONFIG.smoothingNeighbourThreshold) {
            smoothed.add(key);
        }
    }
    return smoothed;
}

/**
 * Whether every one of `(x, y)`'s 8 neighbours is also in `component`.
 *
 * @param component - The tile set to check against, as {@link coordinateKey} strings.
 * @param x - Tile's X position, in tiles from the world origin.
 * @param y - Tile's Y position, in tiles from the world origin.
 * @returns Whether `(x, y)` is fully interior to `component`.
 */
function isFullySurrounded(component: ReadonlySet<string>, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) {
                continue;
            }
            if (!component.has(coordinateKey(x + dx, y + dy))) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Tiles in `component` whose all 8 neighbours are also in `component` - the
 * set the biome vote treats as reliably interior.
 *
 * @param component - The final (smoothed) tile set, as {@link coordinateKey} strings.
 * @returns The core (interior) subset of `component`, possibly empty.
 */
function findCoreTiles(component: ReadonlySet<string>): Set<string> {
    const core = new Set<string>();
    for (const key of component) {
        const [x, y] = parseCoordinateKey(key);
        if (isFullySurrounded(component, x, y)) {
            core.add(key);
        }
    }
    return core;
}

/**
 * Each tile's distance from the component's edge, in 8-connected rings:
 * edge tiles (at least one neighbour outside `component`) get distance 1,
 * increasing by 1 per ring moving inward.
 *
 * @param component - The final (smoothed) tile set, as {@link coordinateKey} strings.
 * @returns Every tile's shore distance, keyed by {@link coordinateKey}.
 */
function computeShoreDistances(component: ReadonlySet<string>): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [];

    for (const key of component) {
        const [x, y] = parseCoordinateKey(key);
        if (!isFullySurrounded(component, x, y)) {
            distances.set(key, 1);
            queue.push(key);
        }
    }

    for (const currentKey of queue) {
        const [x, y] = parseCoordinateKey(currentKey);
        const distance = distances.get(currentKey) as number;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                const key = coordinateKey(x + dx, y + dy);
                if (!component.has(key) || distances.has(key)) {
                    continue;
                }
                distances.set(key, distance + 1);
                queue.push(key);
            }
        }
    }

    return distances;
}

/** One accepted lake, ready to paint. */
interface LakeComponent {
    /** Every tile the lake covers, as {@link coordinateKey} strings. */
    tiles: ReadonlySet<string>;
    /** The subset of {@link tiles} used for the biome vote - see {@link findCoreTiles}. */
    coreTiles: ReadonlySet<string>;
}

/** Lakes: a region-style feature - flood-filled, smoothed, min-size and biome-vote gated. */
export class LakeFeature extends Feature {
    private readonly moisture: NoiseField;
    private readonly wetness: NoiseField;
    private readonly lakeShape: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this feature's fields sample deterministically.
     */
    public constructor(worldSeed: number) {
        super();
        this.moisture = new FbmField("moisture", worldSeed, LAKE_CONFIG.moistureSeedOffset, LAKE_CONFIG.moistureFrequency, LAKE_CONFIG.fieldOctaves);
        this.wetness = new FbmField("wetness", worldSeed, LAKE_CONFIG.wetnessSeedOffset, LAKE_CONFIG.wetnessFrequency, LAKE_CONFIG.fieldOctaves);
        this.lakeShape = new FbmField("lake_shape", worldSeed, LAKE_CONFIG.lakeShapeSeedOffset, LAKE_CONFIG.lakeShapeFrequency, LAKE_CONFIG.fieldOctaves);
    }

    public override getFields(): readonly NoiseField[] {
        return [this.moisture, this.wetness, this.lakeShape];
    }

    public override apply(tiles: TileData[][], chunkX: number, chunkY: number, resolveBiomeAt: BiomeResolver): void {
        const components = this.discoverComponents(resolveBiomeAt, chunkX, chunkY);
        for (const component of components) {
            const shoreDistances = computeShoreDistances(component.tiles);
            for (const key of component.tiles) {
                const [worldX, worldY] = parseCoordinateKey(key);
                const localX = worldX - chunkX * CHUNK_SIZE;
                const localY = worldY - chunkY * CHUNK_SIZE;
                if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
                    continue;
                }
                const shoreDistance = shoreDistances.get(key) as number;
                // A shore tile (any neighbour outside the lake) is never dark, regardless of threshold.
                const isEdge = shoreDistance === 1;
                const threshold = LakeFeature.deepWaterThreshold(shoreDistance);
                const isDeep = !isEdge && this.lakeShape.sample(worldX, worldY) >= threshold;
                tiles[localY][localX].groundType = isDeep ? "waterDark" : "waterLight";
                tiles[localY][localX].featureTag = isDeep ? "lake:deep" : "lake:shallow";
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
     * Majority-votes `coreTiles`' biome, each resolved at its own world
     * position, against `LAKE_CONFIG.allowedBiomes`.
     *
     * @param coreTiles - A lake's core tiles, as {@link coordinateKey} strings.
     * @param resolveBiomeAt - Resolves the biome at an absolute world position.
     * @returns Whether the majority biome is in `LAKE_CONFIG.allowedBiomes`.
     */
    private coreTilesVoteAllowed(coreTiles: ReadonlySet<string>, resolveBiomeAt: BiomeResolver): boolean {
        const counts = new Map<string, number>();
        for (const key of coreTiles) {
            const [x, y] = parseCoordinateKey(key);
            const name = resolveBiomeAt(x, y).name;
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        let majorityName = "";
        let majorityCount = -1;
        for (const [name, count] of counts) {
            if (count > majorityCount) {
                majorityName = name;
                majorityCount = count;
            }
        }
        return LAKE_CONFIG.allowedBiomes.includes(majorityName);
    }

    /**
     * Flood-fills 8-connected from `(startWorldX, startWorldY)` via
     * `isCandidateCached`, stopping and reporting `exceededCap: true` if the
     * component would grow past `LAKE_CONFIG.maxTiles`.
     *
     * @param startWorldX - Seed tile's X position, in tiles from the world origin.
     * @param startWorldY - Seed tile's Y position, in tiles from the world origin.
     * @param isCandidateCached - Memoised lake-candidacy check.
     * @returns The raw (unsmoothed) component, as {@link coordinateKey} strings, and whether it exceeded the cap.
     */
    private floodFill(
        startWorldX: number,
        startWorldY: number,
        isCandidateCached: (worldX: number, worldY: number) => boolean,
    ): {raw: Set<string>; exceededCap: boolean} {
        const raw = new Set<string>([coordinateKey(startWorldX, startWorldY)]);
        const queue: [number, number][] = [[startWorldX, startWorldY]];
        let exceededCap = false;

        while (queue.length > 0) {
            if (raw.size > LAKE_CONFIG.maxTiles) {
                exceededCap = true;
                break;
            }
            const [x, y] = queue.shift() as [number, number];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) {
                        continue;
                    }
                    const nx = x + dx;
                    const ny = y + dy;
                    const key = coordinateKey(nx, ny);
                    if (raw.has(key) || !isCandidateCached(nx, ny)) {
                        continue;
                    }
                    raw.add(key);
                    queue.push([nx, ny]);
                }
            }
        }

        return {raw, exceededCap};
    }

    /**
     * Discovers every lake touching the chunk at `(chunkX, chunkY)`: floods
     * out from each candidate tile local to the chunk (candidacy memoised
     * per call), then smooths, min-size checks, core-tiles, and
     * biome-votes each surviving component.
     *
     * @param resolveBiomeAt - Resolves the biome at an absolute world position.
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns Every accepted lake touching this chunk (usually 0 or 1).
     */
    private discoverComponents(resolveBiomeAt: BiomeResolver, chunkX: number, chunkY: number): LakeComponent[] {
        const candidacyCache = new PositionCache<boolean>();
        const isCandidateCached = (worldX: number, worldY: number): boolean =>
            candidacyCache.get([worldX, worldY], ([x, y]) => this.isCandidate(x, y));

        const visited = new Set<string>();
        const components: LakeComponent[] = [];

        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunkX * CHUNK_SIZE + localX;
                const worldY = chunkY * CHUNK_SIZE + localY;
                const startKey = coordinateKey(worldX, worldY);
                if (visited.has(startKey) || !isCandidateCached(worldX, worldY)) {
                    continue;
                }

                const {raw, exceededCap} = this.floodFill(worldX, worldY, isCandidateCached);
                for (const key of raw) {
                    visited.add(key);
                }
                if (exceededCap) {
                    continue;
                }

                let smoothed: Set<string> = raw;
                for (let pass = 0; pass < LAKE_CONFIG.smoothingPasses; pass++) {
                    smoothed = smoothComponent(smoothed);
                }
                if (smoothed.size < LAKE_CONFIG.minSize) {
                    continue;
                }

                const coreTiles = findCoreTiles(smoothed);
                if (coreTiles.size === 0) {
                    continue;
                }

                if (!this.coreTilesVoteAllowed(coreTiles, resolveBiomeAt)) {
                    continue;
                }

                components.push({tiles: smoothed, coreTiles});
            }
        }

        return components;
    }
}
