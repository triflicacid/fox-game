import {Structure} from "./structure";
import {StructureManifest, StructureManifestPiece} from "./structure-manifest";
import manifestJson from "./cactus-structures.json";
import {BiomeTag} from "../biome/biome";
import {NoiseField} from "../noise-field";
import {CactusSpriteType} from "../../../sprites/CactusSpriteSheet";

const manifest = manifestJson as StructureManifest;

/** Every cactus renders sub-tile, entirely within its own anchor tile. */
const MAXIMUM_REACH_TILES = 0;

/** Every tunable cactus-generation value, grouped so they're tuned in one place. First-guess values, not yet tuned. */
const CACTUS_CONFIG = {
    /** Per-structure-type offset so this structure's rolls don't correlate with another structure's. */
    hashSeedOffset: 9201,

    familySalt: 1,
    armSalt: 2,
    saguaroFlowerSalt: 3,
    barrelFlowerChanceSalt: 4,
    barrelFlowerColorSalt: 5,
    /** Roll salts for a cell's jittered candidate position - see {@link Structure.isSoleCellCandidate}. */
    cellJitterXSalt: 6,
    cellJitterYSalt: 7,

    /** Larger than trees' own cell, so cacti still read as scattered rather than just avoiding overlap. */
    cellMarginTiles: 3,
    cellSizeTiles: 3 * 2 + 4,

    /** Flat acceptance chance for a cell's candidate - not banded by ground type, so density carries no clustering signal. */
    baseSpawnChance: 0.35,
    /** Multiplier applied right at the desert's border with another biome, so cacti thin out rather than cutting off hard. */
    borderSpawnChanceMultiplier: 0.35,

    /** Fraction of instances that are barrel rather than saguaro. */
    barrelFamilyChance: 0.75,

    /** Cumulative thresholds over `armSalt`'s roll; the remainder picks both arms. */
    armThresholds: {noArm: 0.45, left: 0.675, right: 0.9},
    saguaroFloweringChance: 0.3,

    barrelFloweringChance: 0.45,
} as const;

/** Cacti: a `Structure` whose families (saguaro/barrel) are single-tile, sub-tile-rendered sprites, sparsely and independently scattered across the desert. */
export class CactusStructure extends Structure<CactusSpriteType> {
    /**
     * @param worldSeed - The world's seed, so this structure's rolls sample deterministically.
     * @param isFeatureSite - Whether a world position is a candidate site for another feature (e.g. an oasis) - cacti avoid these so they can't grow on water.
     */
    public constructor(
        worldSeed: number,
        private readonly isFeatureSite: (worldX: number, worldY: number) => boolean,
    ) {
        super(worldSeed, CACTUS_CONFIG.hashSeedOffset, "cactus");
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
        return ["desert"];
    }

    protected override isExcluded(worldX: number, worldY: number): boolean {
        return this.isFeatureSite(worldX, worldY);
    }

    protected override getSpawnChance(worldX: number, worldY: number, biomeTag: BiomeTag, biomeDepth: number): number {
        void biomeTag;

        const isCandidate = this.isSoleCellCandidate(
            worldX, worldY,
            CACTUS_CONFIG.cellSizeTiles, CACTUS_CONFIG.cellMarginTiles,
            CACTUS_CONFIG.cellJitterXSalt, CACTUS_CONFIG.cellJitterYSalt,
        );
        if (!isCandidate) {
            return 0;
        }

        const multiplier = biomeDepth === 0 ? CACTUS_CONFIG.borderSpawnChanceMultiplier : 1;
        return CACTUS_CONFIG.baseSpawnChance * multiplier;
    }

    protected override pickFamily(worldX: number, worldY: number): string {
        // independent per-cell roll, not a spatial field - keeps families interleaved instead of patchy
        return this.roll(worldX, worldY, CACTUS_CONFIG.familySalt) < CACTUS_CONFIG.barrelFamilyChance ? "barrel" : "saguaro";
    }

    /** Every cactus is a single piece, so all its variety comes from these per-instance rolls rather than piece/role branching. */
    protected override resolveSprite(
        family: string,
        piece: StructureManifestPiece,
        anchorWorldX: number,
        anchorWorldY: number,
    ): CactusSpriteType {
        void piece;

        if (family === "barrel") {
            const flowering = this.roll(anchorWorldX, anchorWorldY, CACTUS_CONFIG.barrelFlowerChanceSalt) < CACTUS_CONFIG.barrelFloweringChance;
            if (!flowering) {
                return "cactus.barrel.plain";
            }
            const colorRoll = this.roll(anchorWorldX, anchorWorldY, CACTUS_CONFIG.barrelFlowerColorSalt);
            if (colorRoll < 1 / 3) return "cactus.barrel.flower_pink";
            if (colorRoll < 2 / 3) return "cactus.barrel.flower_yellow";
            return "cactus.barrel.flower_white";
        }

        const armRoll = this.roll(anchorWorldX, anchorWorldY, CACTUS_CONFIG.armSalt);
        const arm = armRoll < CACTUS_CONFIG.armThresholds.noArm ? "no_arm"
            : armRoll < CACTUS_CONFIG.armThresholds.left ? "arm_left"
            : armRoll < CACTUS_CONFIG.armThresholds.right ? "arm_right"
            : "both_arms";
        const flowering = this.roll(anchorWorldX, anchorWorldY, CACTUS_CONFIG.saguaroFlowerSalt) < CACTUS_CONFIG.saguaroFloweringChance;
        return `cactus.saguaro.${arm}${flowering ? "_flower" : ""}` as CactusSpriteType;
    }
}
