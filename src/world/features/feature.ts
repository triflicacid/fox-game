import type {Biome} from "../terrain-generator";
import type {TileData} from "../tile";
import type {Chunk} from "../chunk";
import {CHUNK_SIZE} from "../chunk-size";

/**
 * Base class for a discrete world feature that a
 * `Chunk` may generate on top of its terrain.
 */
export abstract class Feature {
    /**
     * @param name - Short label for this feature.
     * @param coveredWorldTiles - Every absolute world tile position this feature covers, as `worldTileKey` strings. May span more than one chunk.
     */
    protected constructor(
        public readonly name: string,
        protected readonly coveredWorldTiles: ReadonlySet<string>,
    ) {
    }

    /**
     * Paints this feature over whichever of its covered tiles fall within
     * `chunk`'s own local grid. A feature spanning multiple chunks gets
     * `paint` called once per chunk it touches, with each call only filling
     * in that chunk's own portion.
     *
     * @param grid - `chunk`'s mutable, not-yet-finalized tile data, indexed `[localY][localX]`.
     * @param chunk - The chunk currently being painted into.
     */
    public abstract paint(grid: TileData[][], chunk: Chunk): void;

    /** Which biome(s) this feature is eligible to generate in. */
    public abstract getApplicableBiomes(): readonly Biome[];

    /**
     * Minimum tile count for a generated occurrence to actually be painted.
     */
    public abstract getMinSize(): number;

    /**
     * Maximum tile count {@link findComponents}/{@link floodFill} will
     * explore for one occurrence.
     */
    public abstract getMaxSize(): number;

    /**
     * Rolls this feature type's own noise-driven chance to appear for the
     * given chunk, returning every qualifying instance touching it (usually
     * 0 or 1, occasionally more if this chunk happens to touch multiple
     * disjoint occurrences). Called on a shared "prototype" instance of each
     * feature type (see `Chunk`'s `FEATURE_PROTOTYPES`) - an instance method
     * rather than a static one only because TypeScript has no
     * abstract-static-member support, so there's no other way to force every
     * subclass to implement it.
     *
     * @param worldSeed - The world's seed.
     * @param chunk - The chunk this feature would belong to.
     */
    public abstract tryGenerate(worldSeed: number, chunk: Chunk): Feature[];

    /**
     * Builds the string key {@link coveredWorldTiles}.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns A key uniquely identifying that world position.
     */
    protected static worldTileKey(worldX: number, worldY: number): string {
        return `${worldX},${worldY}`;
    }

    /**
     * Inverse of {@link worldTileKey}.
     *
     * @param key - A key previously produced by {@link worldTileKey}.
     * @returns The `[worldX, worldY]` it encodes.
     */
    protected static parseWorldTileKey(key: string): [number, number] {
        const [worldX, worldY] = key.split(",");
        return [Number(worldX), Number(worldY)];
    }

    /**
     * Flood-fills outward from `(startWorldX, startWorldY)`,
     * collecting every 8-connected eligible tile.
     * `isEligible` is what shrinks a feature at a chunk boundary it can't cross.
     *
     * @param startWorldX - Seed tile's X position, in tiles from the world origin.
     * @param startWorldY - Seed tile's Y position, in tiles from the world origin.
     * @param isEligible - Whether a given world tile is part of this feature's shape.
     * @param maxTiles - Hard cap on how many tiles to explore.
     * @returns Every world tile position found, as {@link worldTileKey} strings.
     */
    protected static floodFill(
        startWorldX: number,
        startWorldY: number,
        isEligible: (worldX: number, worldY: number) => boolean,
        maxTiles: number,
    ): Set<string> {
        const covered = new Set<string>([Feature.worldTileKey(startWorldX, startWorldY)]);
        const queue: [number, number][] = [[startWorldX, startWorldY]];

        while (queue.length > 0 && covered.size < maxTiles) {
            const [x, y] = queue.shift() as [number, number];
            for (let dy = -1; dy <= 1 && covered.size < maxTiles; dy++) {
                for (let dx = -1; dx <= 1 && covered.size < maxTiles; dx++) {
                    if (dx === 0 && dy === 0) {
                        continue;
                    }
                    const neighbourX = x + dx;
                    const neighbourY = y + dy;
                    const key = Feature.worldTileKey(neighbourX, neighbourY);
                    if (covered.has(key) || !isEligible(neighbourX, neighbourY)) {
                        continue;
                    }
                    covered.add(key);
                    queue.push([neighbourX, neighbourY]);
                }
            }
        }
        return covered;
    }

    /**
     * Erodes ragged edge tiles from `component`: a tile survives iff at
     * least `neighbourThreshold` of its 8 neighbours are also in `component`
     * This is a standard cellular-automaton smoothing rule, used here
     * to soften the artificial straight-line edge
     * {@link floodFill} can leave where `isEligible` cuts a shape off at a
     * chunk boundary (see `LakeFeature`) - that cut follows the chunk grid
     * exactly, which reads as obviously artificial next to the organic
     * curves the underlying noise field produces everywhere else.
     *
     * This is a blunt tool, not a targeted one: it erodes thin/jagged bits
     * of a shape's *entire* boundary, not just the chunk-cut portion
     * specifically (there's no cheap way to tell the two apart from inside
     * `component` alone), and along a wide, flat chunk-boundary cut through
     * a thick shape, one pass mostly shaves corners rather than producing
     * real curvature. Good enough to break up the obviously-artificial
     * straight edge; not a substitute for a proper distance-based taper if
     * that turns out to still look wrong in practice - see "Open questions".
     *
     * Not appropriate for every feature shape: a thin, 1-2 tile wide feature
     * (a river) has too few neighbours per tile to survive any reasonable
     * threshold and would simply erode away entirely, so this is opt-in
     * (see {@link findComponents}'s `smoothingNeighbourThreshold` parameter)
     * rather than always applied.
     *
     * @param component - The tile set to smooth, as `worldTileKey` strings.
     * @param neighbourThreshold - Minimum covered-neighbour count (of 8) for a tile to survive.
     * @returns The smoothed tile set - a subset of `component`, possibly empty.
     */
    protected static smoothComponent(component: ReadonlySet<string>, neighbourThreshold: number): Set<string> {
        const smoothed = new Set<string>();
        for (const key of component) {
            const [x, y] = Feature.parseWorldTileKey(key);
            let neighbourCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) {
                        continue;
                    }
                    if (component.has(Feature.worldTileKey(x + dx, y + dy))) {
                        neighbourCount++;
                    }
                }
            }
            if (neighbourCount >= neighbourThreshold) {
                smoothed.add(key);
            }
        }
        return smoothed;
    }

    /**
     * Generic "find every occurrence of this feature touching `chunk`"
     * scan: walks `chunk`'s own tiles, flood-fills outward from each
     * not-yet-claimed eligible one, optionally smooths the result
     * ({@link smoothComponent}), and keeps only components that meet
     * `minSize` **after** smoothing (smoothing can shrink a component below
     * the minimum even if the raw flood-fill cleared it, so the check has to
     * come after, not before) - the shared shrink/smooth/abort policy every
     * feature gets for free, not something each subclass re-derives. A
     * future feature (a clump of trees, a patch of flowers, ...) that wants
     * the same "generate a blob, shrink it to fit compatible chunks, smooth
     * the result, abandon it if what's left is too small to read as
     * anything" behaviour just calls this with its own
     * `isEligible`/`minSize`/`maxSize`, the same way `LakeFeature`/
     * `RiverFeature` do.
     *
     * @param chunk - The chunk being scanned for occurrences.
     * @param isEligible - Whether a given world tile is part of this feature's shape (see {@link floodFill}).
     * @param minSize - Minimum tile count (after smoothing, if any) for a found component to be kept; smaller ones are discarded entirely.
     * @param maxSize - Passed straight through to {@link floodFill} as `maxTiles`.
     * @param smoothingNeighbourThreshold - If given, every raw component is passed through {@link smoothComponent} with this threshold before the size check. Omit to skip smoothing entirely (see {@link smoothComponent}'s doc on why a thin feature like a river should).
     * @returns Every qualifying component found, as sets of `worldTileKey` strings - zero, one, or more per chunk.
     */
    protected static findComponents(
        chunk: Chunk,
        isEligible: (worldX: number, worldY: number) => boolean,
        minSize: number,
        maxSize: number,
        smoothingNeighbourThreshold?: number,
    ): Set<string>[] {
        const components: Set<string>[] = [];
        const visited = new Set<string>();
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                const worldX = chunk.chunkX * CHUNK_SIZE + localX;
                const worldY = chunk.chunkY * CHUNK_SIZE + localY;
                const key = Feature.worldTileKey(worldX, worldY);
                if (visited.has(key) || !isEligible(worldX, worldY)) {
                    continue;
                }

                const rawComponent = Feature.floodFill(worldX, worldY, isEligible, maxSize);
                for (const coveredKey of rawComponent) {
                    visited.add(coveredKey);
                }

                const finalComponent = smoothingNeighbourThreshold === undefined
                    ? rawComponent
                    : Feature.smoothComponent(rawComponent, smoothingNeighbourThreshold);
                if (finalComponent.size >= minSize) {
                    components.push(finalComponent);
                }
            }
        }
        return components;
    }
}
