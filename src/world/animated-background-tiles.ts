import {hashLatticePoint} from "./noise";

/** Distinguishes this module's per-tile phase offset hash from unrelated {@link hashLatticePoint} callers. */
const PHASE_OFFSET_SEED = 0x57a7e5;

/**
 * Shared phase-cycling machinery for any looping, non-entity-owned
 * background tile animation - currently just water, but written generically
 * so a future animated tile type (e.g. lava) reuses the same offsetting
 * instead of reinventing it.
 */

/**
 * Derives a stable per-tile starting point within its phase cycle from the
 * tile's own world position, so neighbouring tiles of the same animated type
 * don't all flip frames showing the identical phase - see {@link resolvePhase}.
 *
 * @param worldX - The tile's X position, in tiles from the world origin.
 * @param worldY - The tile's Y position, in tiles from the world origin.
 * @param phaseCount - How many phases this tile's animation cycles through.
 * @returns A phase offset in `[0, phaseCount)`.
 */
export function computePhaseOffset(worldX: number, worldY: number, phaseCount: number): number {
    return Math.floor(hashLatticePoint(PHASE_OFFSET_SEED, worldX, worldY) * phaseCount);
}

/**
 * Resolves which phase index an animated tile should show right now, from a
 * shared continuous animation clock plus the tile's own
 * {@link computePhaseOffset} starting point.
 *
 * @param elapsedMs - Total elapsed time on the shared animation clock, in milliseconds.
 * @param frameIntervalMs - How long, in milliseconds, this tile's type shows each phase before advancing.
 * @param phaseOffset - This tile's own starting offset - see {@link computePhaseOffset}.
 * @param phaseCount - How many phases this tile's animation cycles through.
 * @returns The phase index to show, in `[0, phaseCount)`.
 */
export function resolvePhase(elapsedMs: number, frameIntervalMs: number, phaseOffset: number, phaseCount: number): number {
    return (Math.floor(elapsedMs / frameIntervalMs) + phaseOffset) % phaseCount;
}
