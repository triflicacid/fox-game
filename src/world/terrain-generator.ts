import {sampleFbm2d, sampleGradientNoise2d, sampleNoise2d} from "./noise";
import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";
import {CHUNK_SIZE} from "./chunk-size";

/**
 * Per-channel seed offset for grass variety.
 */
const GRASS_SEED_OFFSET = 1013;

/**
 * Noise cycles per tile for grass variety: `0.1` means one lattice cell
 * spans 10 tiles.
 */
const GRASS_FREQUENCY = 1 / 10;

/** Grass variants, in ascending order of the noise band that selects them. */
const GRASS_VARIANTS: readonly BackgroundTileType[] = ["grass1", "grass2", "grass3"];

/**
 * Picks which grass variant a tile at the given absolute world tile
 * coordinate should show:
 * samples a smooth, low/mid-frequency noise field and thresholds it
 * into `GRASS_VARIANTS.length` equal bands.
 * Using continuous noise makes neighbouring tiles correlate into irregular patches
 * of one variant blending into the next.
 *
 * @param worldSeed - The world's seed.
 * @param worldX - Tile's X position, in tiles from the world origin.
 * @param worldY - Tile's Y position, in tiles from the world origin.
 * @returns The grass variant to use for this tile.
 */
export function sampleGrassType(worldSeed: number, worldX: number, worldY: number): BackgroundTileType {
    const noiseValue = sampleNoise2d(worldSeed + GRASS_SEED_OFFSET, worldX, worldY, GRASS_FREQUENCY);
    const index = Math.min(GRASS_VARIANTS.length - 1, Math.floor(noiseValue * GRASS_VARIANTS.length));
    return GRASS_VARIANTS[index];
}

// ---- Biomes: plains / wetPlains / lakePlains ----
//
// Every `Chunk` has one `Biome`, all "quasi-plain" for now (no desert/forest
// yet - see `plans/terrain-generation.md`'s biome sketch for that later,
// separate piece of work): `"plains"` is the default grassland, `"wetPlains"`
// is where a river feature may generate, and `"lakePlains"` is where a lake
// feature may. Both non-default biomes come from thresholding ONE
// very-low-frequency `waterRegionNoise` field into ordered bands (same
// single-continuous-axis trick as the desert|plains|forest sketch): most of
// the world sits below WATER_REGION_THRESHOLD and is plain grassland, with
// no river/lake system eligible there at all - only inside that band does
// the lake-blob field get a say in whether a chunk is `wetPlains` or
// `lakePlains`.

/** Per-channel seed offsets, so these channels don't correlate with grass variety or each other. */
const WATER_REGION_SEED_OFFSET = 7001;
const LAKE_SEED_OFFSET = 8001;
const RIVER_SEED_OFFSET = 9001;

/** Very low frequency - wet regions span dozens of chunks, so a river has room to be long. */
const WATER_REGION_FREQUENCY = 1 / 64;

/**
 * Above this raw noise value, a chunk sits inside a "wet region"
 * (`wetPlains`/`lakePlains`) where lakes/rivers are eligible at all -
 * empirically around the 82nd percentile of this field's values, so roughly
 * a sixth of the world is wet region, the rest plain `plains`.
 */
const WATER_REGION_THRESHOLD = 0.78;

/** Lake blob shape: moderate frequency, smoothed via fBm (see `sampleFbm2d`) to avoid a pockmarked look. */
const LAKE_FREQUENCY = 1 / 14;
const LAKE_OCTAVES = 3;

/**
 * Within a wet region, lake-blob values at or above this are `lakePlains`
 * rather than `wetPlains` - empirically around the 85th percentile of this
 * fBm field's values, so lake blobs cover a minority of any given wet region
 * (most of it is `wetPlains`, eligible for a river but not automatically wet).
 * Also the threshold `LakeFeature` (`src/world/features/lake-feature.ts`)
 * uses against the same field to decide which individual tiles within a
 * `lakePlains` chunk actually count as lake, so the chunk-level biome
 * decision and the feature's own fine-grained shape always agree.
 */
export const LAKE_THRESHOLD = 0.68;

/**
 * Samples the continuous lake-blob field's value at a tile. Shared by
 * {@link sampleBiome} (coarse, chunk-level classification) and `LakeFeature`
 * (fine, per-tile shape within an already-`lakePlains` chunk), so both agree
 * on exactly the same underlying blob rather than risking two independently
 * "close enough" implementations drifting apart.
 *
 * @param worldSeed - The world's seed.
 * @param worldX - Tile's X position, in tiles from the world origin.
 * @param worldY - Tile's Y position, in tiles from the world origin.
 * @returns A value in `[0, 1)` - compare against {@link LAKE_THRESHOLD}.
 */
export function sampleLakeValue(worldSeed: number, worldX: number, worldY: number): number {
    return sampleFbm2d(worldSeed + LAKE_SEED_OFFSET, worldX, worldY, LAKE_FREQUENCY, LAKE_OCTAVES);
}

/** A chunk's biome. Everything here is "quasi-plain" - grassland with a river or lake variant, not a distinct desert/forest biome. */
export type Biome = "plains" | "wetPlains" | "lakePlains";

/**
 * Classifies a chunk at the given absolute world tile coordinate (typically
 * its centre tile - see `Chunk`) into `plains`, `wetPlains`, or `lakePlains` -
 * see the module-level comment above for how the ordered-band trick
 * guarantees `wetPlains` always exists as a buffer around every `lakePlains`
 * region (both come from the same continuous field), which is what lets a
 * `RiverFeature` generated within `wetPlains` plausibly reach a lake.
 *
 * @param worldSeed - The world's seed.
 * @param worldX - Tile's X position, in tiles from the world origin.
 * @param worldY - Tile's Y position, in tiles from the world origin.
 * @returns This chunk's biome.
 */
export function sampleBiome(worldSeed: number, worldX: number, worldY: number): Biome {
    const regionValue = sampleNoise2d(worldSeed + WATER_REGION_SEED_OFFSET, worldX, worldY, WATER_REGION_FREQUENCY);
    if (regionValue < WATER_REGION_THRESHOLD) {
        return "plains";
    }

    return sampleLakeValue(worldSeed, worldX, worldY) >= LAKE_THRESHOLD ? "lakePlains" : "wetPlains";
}

/**
 * Classifies the chunk at the given chunk coordinate into its biome, by
 * sampling {@link sampleBiome} once at that chunk's centre tile. Shared by
 * `Chunk` (to set its own `biome`) and by `Feature` subclasses that need to
 * check a *neighbouring* chunk's biome without generating that chunk (e.g.
 * `LakeFeature`, when deciding whether its blob can spill across a chunk
 * boundary) - both need the exact same "one representative sample per
 * chunk" rule, so it lives here once rather than being reimplemented at
 * each call site.
 *
 * @param worldSeed - The world's seed.
 * @param chunkX - Chunk's X coordinate, in chunk units.
 * @param chunkY - Chunk's Y coordinate, in chunk units.
 * @returns That chunk's biome.
 */
export function sampleChunkBiome(worldSeed: number, chunkX: number, chunkY: number): Biome {
    const centreOffset = Math.floor(CHUNK_SIZE / 2);
    return sampleBiome(worldSeed, chunkX * CHUNK_SIZE + centreOffset, chunkY * CHUNK_SIZE + centreOffset);
}

/**
 * River ridge frequency: deliberately lower than a lake's, so a river reads
 * as one long, sweeping curve threading through a `wetPlains` chunk rather
 * than many short wiggly ones.
 */
const RIVER_FREQUENCY = 1 / 26;

/**
 * Ridge threshold `RiverFeature` (`src/world/features/river-feature.ts`)
 * uses for "on the river" - empirically around the 85th-90th percentile of
 * {@link sampleRiverRidge}'s actual value distribution (same
 * measure-don't-guess approach as every other threshold here), landing at
 * roughly the top 10-13% of values - still deliberately much more
 * permissive than a path would use (paths keep only their top ~4-8% of
 * ridge values to stay sparse and often-disconnected) - rivers should
 * mostly connect, so noticeably more of the field counts.
 */
export const RIVER_RIDGE_THRESHOLD = 0.96;

/**
 * Samples the river-ridge value at a tile: peaks (approaching `1`) along the
 * underlying signed noise field's zero-crossings.
 *
 * Deliberately built on {@link sampleGradientNoise2d} (real gradient/Perlin
 * noise), *not* {@link sampleNoise2d} (the plain value noise every other
 * channel in this file uses) - an earlier version of this used value noise
 * here too, and it visibly failed: value noise's bilinearly-interpolated
 * cells can go nearly flat wherever two adjacent lattice corners hash to
 * similar values (the same effect that makes `sampleNoise2d` concentrate
 * near its own midpoint generally), and wherever that happens, `1 -
 * abs(signedNoise)` stays elevated over a whole *area* instead of a *line* -
 * a river ("always long and noodly") reading as a lake-like blob instead.
 * Gradient noise's zero-crossings don't have that failure mode (see
 * {@link sampleGradientNoise2d}'s doc for why), confirmed via a side-by-side
 * preview render before switching: at matched rarity, the value-noise ridge
 * showed clearly wider, blobbier patches, the gradient-noise ridge a
 * uniformly thin line throughout. This is exactly why lakes and rivers use
 * two different noise algorithms rather than one: a lake *wants* the
 * area/blob behaviour (thresholding {@link sampleFbm2d}'s peaks directly),
 * a river specifically doesn't.
 *
 * @param worldSeed - The world's seed.
 * @param worldX - Tile's X position, in tiles from the world origin.
 * @param worldY - Tile's Y position, in tiles from the world origin.
 * @returns A value roughly in `[0, 1]` - compare against {@link RIVER_RIDGE_THRESHOLD}.
 */
export function sampleRiverRidge(worldSeed: number, worldX: number, worldY: number): number {
    const gradientNoise = sampleGradientNoise2d(worldSeed + RIVER_SEED_OFFSET, worldX, worldY, RIVER_FREQUENCY);
    return 1 - Math.abs(gradientNoise);
}
