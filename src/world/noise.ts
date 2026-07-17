/**
 * Deterministic, seeded 2D noise for terrain generation.
 * Sampling at absolute world tile coordinates makes neighbouring
 * chunks agree on the values right at their shared edge.
 */

/**
 * Integer hash producing a deterministic pseudo-random value in `[0, 1)` for
 * a lattice point.
 *
 * @param seed - Distinguishes one noise channel/lattice from another.
 * @param x - Lattice point X coordinate (integer, may be negative).
 * @param y - Lattice point Y coordinate (integer, may be negative).
 * @returns A value in `[0, 1)`.
 */
function hashLatticePoint(seed: number, x: number, y: number): number {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0xffffffff;
}

/**
 * Ken Perlin's "smootherstep" easing curve: like `smoothstep` but with zero
 * first *and* second derivative at both ends, so tiling this noise's
 * interpolation doesn't show the faint diamond-shaped creases plain linear
 * (or `smoothstep`) interpolation leaves at lattice cell boundaries.
 *
 * @param t - Input in `[0, 1]`.
 * @returns The eased value, also in `[0, 1]`.
 */
function smootherstep(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation between `a` and `b`.
 *
 * @param a - Value at `t = 0`.
 * @param b - Value at `t = 1`.
 * @param t - Interpolation factor, typically in `[0, 1]`.
 * @returns The interpolated value.
 */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Samples smooth, continuous 2D value noise: bilinearly interpolates
 * between hashed values at the four lattice points surrounding `(x, y) * frequency`.
 * Neighbouring samples are correlated so thresholding/banding the result gives irregular but coherent
 * patches.
 *
 * @param seed - This channel's seed (combine a world seed with a fixed
 * per-channel offset so different channels don't correlate with each other).
 * @param x - World tile X coordinate to sample at (absolute, not chunk-local).
 * @param y - World tile Y coordinate to sample at (absolute, not chunk-local).
 * @param frequency - Noise cycles per tile. Smaller values vary more slowly
 * across the world (bigger patches); e.g. `0.1` means one lattice cell spans
 * 10 tiles.
 * @returns A value in `[0, 1)`.
 */
export function sampleNoise2d(seed: number, x: number, y: number, frequency: number): number {
    const sx = x * frequency;
    const sy = y * frequency;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const tx = smootherstep(sx - x0);
    const ty = smootherstep(sy - y0);

    const v00 = hashLatticePoint(seed, x0, y0);
    const v10 = hashLatticePoint(seed, x0 + 1, y0);
    const v01 = hashLatticePoint(seed, x0, y0 + 1);
    const v11 = hashLatticePoint(seed, x0 + 1, y0 + 1);

    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}
