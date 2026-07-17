import type {Chunk} from "../chunk";
import type {TileData} from "../tile";
import {Feature} from "./feature";
import {Biome, LAKE_THRESHOLD, sampleChunkBiome, sampleLakeValue} from "../terrain-generator";
import {CHUNK_SIZE} from "../chunk-size";

/**
 * A lake: every tile whose lake-blob noise value ({@link sampleLakeValue})
 * clears {@link LAKE_THRESHOLD} *and* whose own chunk is `lakePlains` is
 * part of it.
 */
export class LakeFeature extends Feature {
    /**
     * Below this many tiles (after any shrinking at a chunk boundary), a
     * lake would read as a meaningless speckle rather than a body of water -
     * per the "abort if too small, e.g. a 3-tile lake" rule.
     */
    private static readonly MIN_SIZE = 4;

    /**
     * Generous cap on one lake's tile count. Lakes are naturally compact fBm
     * blobs, so real ones should stay far below this in practice - it's a
     * safety bound on generation cost (and cross-chunk consistency - see
     * `Feature.floodFill`'s doc) for a pathological worst case, not a size
     * real lakes are expected to approach.
     */
    private static readonly MAX_SIZE = 400;

    /**
     * Neighbour-count threshold {@link Feature.smoothComponent} uses to
     * erode a lake's raw shape before the size check - see that method's
     * doc for what this does and doesn't fix. `5` (a strict majority of 8)
     * is a starting guess, not tuned against real output yet; see "Open
     * questions".
     */
    private static readonly SMOOTHING_NEIGHBOUR_THRESHOLD = 5;

    /**
     * @param coveredWorldTiles - Defaults to empty: `Chunk`'s
     * `FEATURE_PROTOTYPES` needs one no-argument instance of every feature
     * type purely to call its instance methods (`getMinSize`,
     * `tryGenerate`, ...) on, before any real occurrence has been found.
     */
    public constructor(coveredWorldTiles: ReadonlySet<string> = new Set()) {
        super("lake", coveredWorldTiles);
    }

    public getApplicableBiomes(): readonly Biome[] {
        return ["lakePlains"];
    }

    public getMinSize(): number {
        return LakeFeature.MIN_SIZE;
    }

    public getMaxSize(): number {
        return LakeFeature.MAX_SIZE;
    }

    /**
     * Finds every lake touching `chunk` via {@link Feature.findComponents},
     * using {@link isEligible} (which also crosses into neighbouring chunks)
     * to discover each one's full shape, wherever that actually extends to,
     * then smoothing the result to soften the artificial straight edge a
     * chunk-boundary cutoff otherwise leaves (see
     * {@link Feature.smoothComponent}'s doc). A `lakePlains` chunk (the only
     * biome this is eligible for) always has at least its own centre tile
     * clear the threshold - that's exactly what made `Chunk` classify it
     * `lakePlains` in the first place - so this effectively always finds at
     * least one candidate component per `lakePlains` chunk, though it may
     * still get discarded by the minimum-size check, now applied *after*
     * smoothing (smoothing can shrink a component that cleared the raw
     * flood-fill down below `minSize`).
     *
     * @param worldSeed - The world's seed.
     * @param chunk - The chunk this feature would belong to.
     * @returns Every lake found touching this chunk that met {@link minSize} after smoothing (usually 0 or 1).
     */
    public tryGenerate(worldSeed: number, chunk: Chunk): LakeFeature[] {
        const isEligible = (worldX: number, worldY: number): boolean => LakeFeature.isEligible(worldSeed, worldX, worldY);
        return Feature.findComponents(chunk, isEligible, this.getMinSize(), this.getMaxSize(), LakeFeature.SMOOTHING_NEIGHBOUR_THRESHOLD)
            .map((component) => new LakeFeature(component));
    }

    /**
     * Whether the given absolute world tile both clears the lake-blob
     * threshold and sits in a chunk whose own biome is `lakePlains`. This
     * second check is what shrinks a lake at a chunk boundary instead of
     * letting it spill into an incompatible neighbour: flood-fill simply
     * can't expand past a tile this returns `false` for.
     *
     * @param worldSeed - The world's seed.
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns Whether this tile is eligible to be part of a lake.
     */
    private static isEligible(worldSeed: number, worldX: number, worldY: number): boolean {
        if (sampleLakeValue(worldSeed, worldX, worldY) < LAKE_THRESHOLD) {
            return false;
        }
        const chunkX = Math.floor(worldX / CHUNK_SIZE);
        const chunkY = Math.floor(worldY / CHUNK_SIZE);
        return sampleChunkBiome(worldSeed, chunkX, chunkY) === "lakePlains";
    }

    public paint(grid: TileData[][], chunk: Chunk): void {
        for (const key of this.coveredWorldTiles) {
            const [worldX, worldY] = LakeFeature.parseWorldTileKey(key);
            const localX = worldX - chunk.chunkX * CHUNK_SIZE;
            const localY = worldY - chunk.chunkY * CHUNK_SIZE;
            if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
                continue;
            }
            grid[localY][localX].groundType = this.isFullySurrounded(worldX, worldY) ? "waterDark" : "waterLight";
            grid[localY][localX].feature = this;
        }
    }

    /**
     * Whether every one of `(worldX, worldY)`'s 8 neighbours is also part of
     * this lake - checked against {@link coveredWorldTiles}' absolute world
     * positions, so a lake that legitimately spans a chunk boundary still
     * classifies correctly right up to its true edge, rather than the hard
     * per-chunk cutoff an earlier version of this had.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns Whether this tile is fully interior to the lake.
     */
    private isFullySurrounded(worldX: number, worldY: number): boolean {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (!this.coveredWorldTiles.has(LakeFeature.worldTileKey(worldX + dx, worldY + dy))) {
                    return false;
                }
            }
        }
        return true;
    }
}
