import {sampleNoise2d} from "./noise";
import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";

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
