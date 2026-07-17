import type {Chunk} from "../chunk";
import type {TileData} from "../tile";
import {Feature} from "./feature";
import {Biome, RIVER_RIDGE_THRESHOLD, sampleRiverRidge} from "../terrain-generator";
import {CHUNK_SIZE} from "../chunk-size";

/**
 * A river: every tile within its own chunk whose river-ridge noise value
 * ({@link sampleRiverRidge}) clears {@link RIVER_RIDGE_THRESHOLD} is part of
 * it. Always renders `waterLight` - see `paint`.
 *
 * Unlike `LakeFeature`, a river segment is deliberately kept chunk-local
 * rather than flood-filling across chunk boundaries: a "wet region" can span
 * dozens of chunks (`plans/terrain-generation.md`'s "Noise channels"), so a
 * single connected ridge line could in principle stretch across all of
 * them. Flood-filling that fully - and every touching chunk redoing the same
 * flood-fill independently - would be far more expensive than a lake's
 * compact blob, and per `Feature.floodFill`'s doc, a size cap only keeps
 * every touching chunk's result consistent as long as the true region stays
 * under it; a region that routinely exceeds a reasonable cap risks
 * different chunks capping it at different arbitrary points instead. Rather
 * than pick a cap and hope, `isEligible` itself refuses to leave this chunk,
 * so each chunk generates its own independent local river segment(s), same
 * as before this change - the only difference here is discarding a segment
 * that turns out too tiny to read as anything (via the same
 * `Feature.findComponents`/`minSize` mechanism `LakeFeature` uses).
 */
export class RiverFeature extends Feature {
    /** Below this many tiles, a ridge segment reads as a meaningless speckle rather than a stretch of river, so it's discarded instead of painted. */
    private static readonly MIN_SIZE = 4;

    /** A river segment never leaves its own chunk (see class doc), so this just needs to bound a single chunk's tile count. */
    private static readonly MAX_SIZE = CHUNK_SIZE * CHUNK_SIZE;

    /**
     * @param coveredWorldTiles - Defaults to empty: `Chunk`'s
     * `FEATURE_PROTOTYPES` needs one no-argument instance of every feature
     * type purely to call its instance methods on, before any real
     * occurrence has been found.
     */
    public constructor(coveredWorldTiles: ReadonlySet<string> = new Set()) {
        super("river", coveredWorldTiles);
    }

    public getApplicableBiomes(): readonly Biome[] {
        return ["wetPlains"];
    }

    public getMinSize(): number {
        return RiverFeature.MIN_SIZE;
    }

    public getMaxSize(): number {
        return RiverFeature.MAX_SIZE;
    }

    /**
     * Finds every river segment touching `chunk` via
     * {@link Feature.findComponents}, using {@link isEligible} (which
     * refuses to leave this chunk - see class doc) to discover each
     * segment's full shape.
     *
     * @param worldSeed - The world's seed.
     * @param chunk - The chunk this feature would belong to.
     * @returns Every river segment found in this chunk that met {@link minSize} (usually 0 or 1, occasionally more if the ridge threshold creates multiple disjoint pieces).
     */
    public tryGenerate(worldSeed: number, chunk: Chunk): RiverFeature[] {
        const minWorldX = chunk.chunkX * CHUNK_SIZE;
        const minWorldY = chunk.chunkY * CHUNK_SIZE;
        const isEligible = (worldX: number, worldY: number): boolean => {
            if (worldX < minWorldX || worldX >= minWorldX + CHUNK_SIZE || worldY < minWorldY || worldY >= minWorldY + CHUNK_SIZE) {
                return false;
            }
            return sampleRiverRidge(worldSeed, worldX, worldY) >= RIVER_RIDGE_THRESHOLD;
        };

        return Feature.findComponents(chunk, isEligible, this.getMinSize(), this.getMaxSize())
            .map((component) => new RiverFeature(component));
    }

    public paint(grid: TileData[][], chunk: Chunk): void {
        for (const key of this.coveredWorldTiles) {
            const [worldX, worldY] = RiverFeature.parseWorldTileKey(key);
            const localX = worldX - chunk.chunkX * CHUNK_SIZE;
            const localY = worldY - chunk.chunkY * CHUNK_SIZE;
            // Always waterLight - a river never grows a dark centre, regardless of thickness (see plan doc).
            grid[localY][localX].groundType = "waterLight";
            grid[localY][localX].feature = this;
        }
    }
}
