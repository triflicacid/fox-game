import {Structure} from "./structure";
import {StructureManifest} from "./structure-manifest";
import manifestJson from "./boulder-structures.json";
import {BiomeTag} from "../biome/biome";
import {NoiseField} from "../noise-field";
import {BoulderSpriteType} from "../../../sprites/TundraStructureSpriteSheet";

const manifest = manifestJson as StructureManifest;

/** Widest reach (in tiles, from the anchor) of any shape in `boulder-structures.json`. */
const MAXIMUM_REACH_TILES = 1;

/** Every tunable boulder-generation value, grouped so they're tuned in one place. First-guess values, not yet tuned. */
const BOULDER_CONFIG = {
    /** Per-structure-type offset so this structure's rolls don't correlate with another structure's. */
    hashSeedOffset: 9401,

    /** Roll salt for this structure's own size-tier choice - distinct from `Structure`'s reserved spawn/shape salts. */
    sizeSalt: 1,
    /** Roll salt for a `large`/`huge` instance's own snow-cap coin flip - independent of ground type. */
    snowSalt: 2,
    /** Roll salts for a cell's jittered candidate position - see {@link Structure.isSoleCellCandidate}. */
    cellJitterXSalt: 3,
    cellJitterYSalt: 4,

    /** Similar spacing to Cactus's own cell - boulders should read as roughly as common as cacti, not sparse landmarks like dead trees. */
    cellMarginTiles: 3,
    cellSizeTiles: 3 * 2 + 4,

    /** Flat acceptance chance for a cell's candidate - no ground-type or depth banding, so boulders can turn up anywhere in Tundra, border to interior alike. */
    baseSpawnChance: 0.3,

    /**
     * Cumulative thresholds over `sizeSalt`'s roll; the remainder is
     * `"huge"`. Small is common, large is "reasonably rare", huge rarer
     * still - a landmark within a landmark.
     */
    sizeThresholds: {small: 0.75, large: 0.95},

    /** Fraction of `large`/`huge` instances that roll a snow cap - not every boulder is snow-covered. First-guess value, not yet tuned. */
    snowChance: 0.4,
} as const;

/**
 * Boulders: a `Structure` spanning three size tiers - `small` (single-tile,
 * sub-tile, like Cactus), `large` (a 2x2 formation), and `huge` (a 3x3
 * formation) - scattered uniformly across Tundra with no ground-type or
 * depth bias, unlike Cactus/dead trees. `large`/`huge` additionally layer a
 * snow cap over the bare rock - a separate overlay sprite per position, not
 * a swapped-in alternate rock sprite - on a random per-instance coin flip,
 * independent of ground type: not every boulder is snow-covered.
 */
export class BoulderStructure extends Structure<BoulderSpriteType> {
    /**
     * @param worldSeed - The world's seed, so this structure's rolls sample deterministically.
     * @param isFeatureSite - Whether a world position is a candidate site for another feature (e.g. a lake) - see `Feature.isCandidateSite`. Boulders avoid these so they can't spawn on water.
     */
    public constructor(
        worldSeed: number,
        private readonly isFeatureSite: (worldX: number, worldY: number) => boolean,
    ) {
        super(worldSeed, BOULDER_CONFIG.hashSeedOffset, "boulder");
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

    protected override isExcluded(worldX: number, worldY: number): boolean {
        return this.isFeatureSite(worldX, worldY);
    }

    /** Flat scatter, uncoupled from ground type or biome depth - boulders can turn up anywhere in Tundra. No cross-structure overlap check against `SkeletalTreeStructure` yet - accepted for now, see the tundra plan. */
    protected override getSpawnChance(worldX: number, worldY: number, biomeTag: BiomeTag, biomeDepth: number): number {
        void biomeTag;
        void biomeDepth;

        const isCandidate = this.isSoleCellCandidate(
            worldX, worldY,
            BOULDER_CONFIG.cellSizeTiles, BOULDER_CONFIG.cellMarginTiles,
            BOULDER_CONFIG.cellJitterXSalt, BOULDER_CONFIG.cellJitterYSalt,
        );
        return isCandidate ? BOULDER_CONFIG.baseSpawnChance : 0;
    }

    /** Independent per-cell roll, not a spatial field - keeps sizes interleaved instead of patchy. */
    protected override pickFamily(worldX: number, worldY: number): string {
        const roll = this.roll(worldX, worldY, BOULDER_CONFIG.sizeSalt);
        if (roll < BOULDER_CONFIG.sizeThresholds.small) {
            return "small";
        }
        return roll < BOULDER_CONFIG.sizeThresholds.large ? "large" : "huge";
    }

    /**
     * `small`'s three shapes are each a single-role piece. `large`/`huge`
     * pieces each stack two roles at the same position (see
     * `boulder-structures.json`'s `roles`) - the corner/direction role
     * (e.g. `"nw"`) always renders as the bare-rock sprite; the paired
     * `"snow.<role>"` role is a separate sprite layered on top of it (not a
     * swapped-in "boulder with snow baked in"), resolved - rather than
     * omitted via `undefined` - only for instances that roll snowed. One
     * roll per instance (keyed off the anchor, not the individual role),
     * so every piece of the same boulder agrees on whether it's snowed.
     */
    protected override resolveSprite(
        family: string,
        role: string,
        anchorWorldX: number,
        anchorWorldY: number,
    ): BoulderSpriteType | undefined {
        if (family === "small") {
            return `boulder.small.${role}` as BoulderSpriteType;
        }
        if (role.startsWith("snow.")) {
            const snowed = this.roll(anchorWorldX, anchorWorldY, BOULDER_CONFIG.snowSalt) < BOULDER_CONFIG.snowChance;
            return snowed ? `boulder.${family}.${role}` as BoulderSpriteType : undefined;
        }
        return `boulder.${family}.${role}` as BoulderSpriteType;
    }
}
