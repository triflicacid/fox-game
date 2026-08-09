import {Structure} from "./structure";
import {StructureManifest} from "./structure-manifest";
import manifestJson from "./skeletal-tree-structures.json";
import {BiomeTag} from "../biome/biome";
import {TundraBiome} from "../biome/tundra-biome";
import {NoiseField} from "../noise-field";
import {SkeletalTreeSpriteType} from "../../../sprites/TundraStructureSpriteSheet";

const manifest = manifestJson as StructureManifest;

/** Every skeletal tree renders as a single standalone tile, entirely within its own anchor tile. */
const MAXIMUM_REACH_TILES = 0;

/** Every tunable skeletal-tree-generation value, grouped so they're tuned in one place. First-guess values, not yet tuned. */
const SKELETAL_TREE_CONFIG = {
    /** Per-structure-type offset so this structure's rolls don't correlate with another structure's. */
    hashSeedOffset: 9301,

    /** Roll salts for a cell's jittered candidate position - see {@link Structure.isSoleCellCandidate}. */
    cellJitterXSalt: 1,
    cellJitterYSalt: 2,

    /**
     * Tighter spacing than the "rarer landmark than a cactus" framing alone
     * would suggest, because candidate cells are laid out in absolute world
     * space, independent of where Tundra actually is - a cell's one fixed
     * candidate tile only ever gets a chance to spawn a tree if it happens
     * to land inside Tundra at all. With Tundra itself covering roughly 1%
     * of the map, a Cactus-like cell size left barely any candidates
     * landing in-biome, let alone surviving the icy exclusion and spawn
     * roll on top - the net result read as "basically never spawns" rather
     * than "rare". This is sized so a typical Tundra patch has a realistic
     * chance of containing at least one candidate.
     */
    cellMarginTiles: 1,
    cellSizeTiles: 1 * 2 + 4,

    /** Flat acceptance chance for a cell's candidate - not banded by ground type, so density carries no clustering signal, mirroring Cactus's own flat scatter. Higher than Cactus's own 0.35 to offset how few candidates ever land in Tundra to begin with (see `cellSizeTiles`). */
    baseSpawnChance: 0.6,
    /** Multiplier applied right at Tundra's border with another biome, so dead trees thin out rather than cutting off hard. */
    borderSpawnChanceMultiplier: 0.35,
} as const;

/**
 * Dead trees: a single-family `Structure` whose three shapes
 * are each a standalone sprite rather than a multi-piece canopy.
 */
export class SkeletalTreeStructure extends Structure<SkeletalTreeSpriteType> {
    /**
     * @param worldSeed - The world's seed, so this structure's rolls sample deterministically.
     * @param isFeatureSite - Whether a world position is a candidate site for another feature (e.g. a lake) - see `Feature.isCandidateSite`. Dead trees avoid these so they can't grow on water.
     * @param tundraBiome - The generator's `TundraBiome` instance, so dead trees can be kept off icy ground - see {@link TundraBiome.isIcy}.
     */
    public constructor(
        worldSeed: number,
        private readonly isFeatureSite: (worldX: number, worldY: number) => boolean,
        private readonly tundraBiome: TundraBiome,
    ) {
        super(worldSeed, SKELETAL_TREE_CONFIG.hashSeedOffset, "skeletal_tree");
    }

    public override getFields(): readonly NoiseField[] {
        return [];
    }

    protected override getManifest(): StructureManifest {
        return manifest;
    }

    protected override getMaximumReachTiles(): number {
        return MAXIMUM_REACH_TILES;
    }

    public override getPermittedBiomes(): readonly BiomeTag[] {
        return ["tundra"];
    }

    /** Dead trees avoid water sites, and icy ground - they only grow on Tundra's barren side. */
    protected override isExcluded(worldX: number, worldY: number): boolean {
        return this.isFeatureSite(worldX, worldY) || this.tundraBiome.isIcy(worldX, worldY);
    }

    protected override getSpawnChance(worldX: number, worldY: number, biomeTag: BiomeTag, biomeDepth: number): number {
        void biomeTag;

        const isCandidate = this.isSoleCellCandidate(
            worldX, worldY,
            SKELETAL_TREE_CONFIG.cellSizeTiles, SKELETAL_TREE_CONFIG.cellMarginTiles,
            SKELETAL_TREE_CONFIG.cellJitterXSalt, SKELETAL_TREE_CONFIG.cellJitterYSalt,
        );
        if (!isCandidate) {
            return 0;
        }

        // border cells carry depth 1, not 0 - see `computeCappedRegionDepths`
        const multiplier = biomeDepth === 1 ? SKELETAL_TREE_CONFIG.borderSpawnChanceMultiplier : 1;
        return SKELETAL_TREE_CONFIG.baseSpawnChance * multiplier;
    }

    /** Only one family - every dead tree is equally "skeletal", varied only by which of the three shapes {@link Structure.generate} rolls. */
    protected override pickFamily(): string {
        return "skeletal";
    }

    /** Every shape is a single piece whose `role` already names its sprite variant - no extra per-instance roll needed. */
    protected override resolveSprite(
        family: string,
        role: string,
    ): SkeletalTreeSpriteType {
        void family;
        return `skeletal_tree.${role}` as SkeletalTreeSpriteType;
    }
}
