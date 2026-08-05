import {Structure} from "./structure";
import {StructureManifest, StructureManifestPiece} from "./structure-manifest";
import manifestJson from "./tree-structures.json";
import {Biome, BiomeTag} from "../biome/biome";
import {FbmField, NoiseField} from "../noise-field";
import {TreeSpriteType} from "../../../sprites/TreeSpriteSheet";
import {BackgroundTileType} from "../../../sprites/BackgroundTileSpriteSheet";

const manifest = manifestJson as StructureManifest;

/**
 * Widest reach (in tiles, from the trunk) of any shape in `tree-structures.json`
 * - currently `oak-wide`/`oak-lopsided`, both reaching 3 tiles. Recompute by
 * hand if the manifest's shapes change; this is deliberately not derived
 * automatically so a manifest edit can't silently under-size the boundary
 * scan's halo. Only governs the boundary scan now - see
 * `MINIMUM_TRUNK_SPACING_TILES` for spacing, since canopies are allowed to
 * overlap.
 */
const MAXIMUM_REACH_TILES = 3;

/**
 * Minimum guaranteed spacing between two trunk tiles. Canopies from
 * different trees are allowed to overlap - their leaf tiles just draw over
 * each other, which reads fine since both are transparent-gapped foreground
 * sprites - only trunks must never bump into one another.
 */
const MINIMUM_TRUNK_SPACING_TILES = 3;

/** Half of `MINIMUM_TRUNK_SPACING_TILES - 1`, so `2 * CELL_MARGIN_TILES + 1 === MINIMUM_TRUNK_SPACING_TILES`. */
const CELL_MARGIN_TILES = (MINIMUM_TRUNK_SPACING_TILES - 1) / 2;

/** Every tunable tree-generation value, grouped so they're tuned in one place. First-guess values, not yet tuned. */
const TREE_CONFIG = {
    /** Per-structure-type offset so this structure's rolls don't correlate with another structure's. */
    hashSeedOffset: 9091,
    /** Roll salt for this structure's own trunk-style choice - distinct from `Structure`'s reserved spawn/shape salts. */
    trunkStyleSalt: 1,
    /** Roll salts for a cell's jittered candidate position - see {@link Structure.isSoleCellCandidate}. */
    cellJitterXSalt: 2,
    cellJitterYSalt: 3,

    /**
     * Only one tile per `cellSizeTiles`-square cell can ever become a
     * candidate anchor (see {@link Structure.isSoleCellCandidate}), so trunks
     * can't crowd arbitrarily close together. `cellMarginTiles` keeps that
     * candidate away from the cell's own edge, so even in the worst case
     * (two adjacent cells both jitter toward each other) two anchors are at
     * least `2 * cellMarginTiles + 1` tiles apart - set so that equals
     * `MINIMUM_TRUNK_SPACING_TILES`. The remaining span per cell is jitter
     * room, kept away from a plain grid look.
     */
    cellMarginTiles: CELL_MARGIN_TILES,
    cellSizeTiles: CELL_MARGIN_TILES * 2 + 4,

    /**
     * Acceptance chance for a cell's candidate, by the ground sprite that
     * same tile would render as - reuses `ForestBiome`'s own depth/noise
     * banding rather than a separate distance measure, so "darker floor"
     * and "denser trees" are literally the same signal, and the jump
     * between bands (rather than a smooth ramp) is the non-linearity.
     */
    spawnChanceByGroundType: {
        forest2: 0.05, // light - border rings
        forest1: 0.35, // medium
        forest3: 0.9,  // dark - only reachable at capped interior depth
    } as Partial<Record<BackgroundTileType, number>>,

    /** Regional field deciding which family a patch of Forest grows - a smooth field so families form coherent groves rather than tile-by-tile speckle. */
    groveSeedOffset: 9137,
    /** Noise cycles per tile: a grove is much smaller than a whole Forest region, so several can appear within one. */
    groveFrequency: 1 / 24,
    groveOctaves: 2,
    /** `tree_grove` value at/above which a grove is oak rather than birch. */
    groveThreshold: 0.5,
} as const;

/** Trees: a `Structure` whose families (oak/birch) and shapes come from {@link manifest}. */
export class TreeStructure extends Structure<TreeSpriteType> {
    private readonly grove: NoiseField;

    /**
     * @param worldSeed - The world's seed, so this structure's rolls/fields sample deterministically.
     * @param isFeatureSite - Whether a world position is a candidate site for another feature (e.g. a lake) - see `Feature.isCandidateSite`. Trees avoid these so they can't grow on water.
     * @param forestBiome - The generator's `ForestBiome` instance, so spawn chance can key off the exact ground sprite it would resolve.
     */
    public constructor(
        worldSeed: number,
        private readonly isFeatureSite: (worldX: number, worldY: number) => boolean,
        private readonly forestBiome: Biome,
    ) {
        super(worldSeed, TREE_CONFIG.hashSeedOffset, "tree");
        this.grove = new FbmField(
            "tree_grove",
            worldSeed,
            TREE_CONFIG.groveSeedOffset,
            TREE_CONFIG.groveFrequency,
            TREE_CONFIG.groveOctaves,
        );
    }

    public override getFields(): readonly NoiseField[] {
        return [this.grove];
    }

    protected override getManifest(): StructureManifest {
        return manifest;
    }

    protected override getMaximumReachTiles(): number {
        return MAXIMUM_REACH_TILES;
    }

    public override getPermittedBiomes(): readonly BiomeTag[] {
        return ["forest"];
    }

    /**
     * `isFeatureSite` is a conservative over-approximation (see
     * `Feature.isCandidateSite`), so this may also reject a handful of
     * tiles that wouldn't actually have become water - acceptable, since
     * the requirement is that trees never generate on water, not that they
     * fill every tile that stays dry.
     */
    protected override isExcluded(worldX: number, worldY: number): boolean {
        return this.isFeatureSite(worldX, worldY);
    }

    protected override getSpawnChance(worldX: number, worldY: number, biomeTag: BiomeTag, biomeDepth: number): number {
        void biomeTag;

        const isCandidate = this.isSoleCellCandidate(
            worldX, worldY,
            TREE_CONFIG.cellSizeTiles, TREE_CONFIG.cellMarginTiles,
            TREE_CONFIG.cellJitterXSalt, TREE_CONFIG.cellJitterYSalt,
        );
        if (!isCandidate) {
            return 0;
        }

        const groundType = this.forestBiome.sampleBaseTerrain(worldX, worldY, biomeDepth);
        return TREE_CONFIG.spawnChanceByGroundType[groundType] ?? 0;
    }

    protected override pickFamily(worldX: number, worldY: number): string {
        return this.grove.sample(worldX, worldY) >= TREE_CONFIG.groveThreshold ? "oak" : "birch";
    }

    /** Leaves always use their family's one leaf sprite; trunk tiles independently roll square vs round per instance. */
    protected override resolveSprite(
        family: string,
        piece: StructureManifestPiece,
        anchorWorldX: number,
        anchorWorldY: number,
    ): TreeSpriteType {
        if (piece.role === "leaf") {
            return `${family}Leaves` as TreeSpriteType;
        }
        const round = this.roll(anchorWorldX, anchorWorldY, TREE_CONFIG.trunkStyleSalt) < 0.5;
        return `${family}Log${round ? "Round" : "Square"}` as TreeSpriteType;
    }
}
