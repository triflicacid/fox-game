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

/**
 * Samples fractional Brownian motion: `octaves` layers of {@link sampleNoise2d}
 * stacked at doubling frequency and halving amplitude, normalized back to
 * `[0, 1)`. Each octave uses a distinct derived seed so they don't just
 * repeat the same pattern at a different scale.
 *
 * Smooths out the single-octave "isolated spike" failure mode a raw field
 * has when thresholded at a high value (a lone lattice cell clearing the
 * threshold with sub-threshold neighbours on every side): summing multiple
 * octaves correlates neighbouring samples more strongly, so wherever the
 * summed field clears a high threshold, it tends to do so over a coherent
 * multi-tile region instead of a single-tile blip.
 *
 * @param seed - This channel's seed.
 * @param x - World tile X coordinate to sample at (absolute, not chunk-local).
 * @param y - World tile Y coordinate to sample at (absolute, not chunk-local).
 * @param frequency - Base noise cycles per tile (the first/lowest octave's frequency).
 * @param octaves - Number of layers to sum. More octaves add finer detail on top of the base shape.
 * @returns A value in `[0, 1)`.
 */
export function sampleFbm2d(seed: number, x: number, y: number, frequency: number, octaves: number): number {
    let value = 0;
    let amplitude = 1;
    let totalAmplitude = 0;
    let currentFrequency = frequency;
    for (let octave = 0; octave < octaves; octave++) {
        value += sampleNoise2d(seed + octave * 7919, x, y, currentFrequency) * amplitude;
        totalAmplitude += amplitude;
        amplitude *= 0.5;
        currentFrequency *= 2;
    }
    return value / totalAmplitude;
}

/**
 * 8 evenly-spaced unit vectors - the gradient directions {@link sampleGradientNoise2d}
 * assigns to lattice points. A full Perlin implementation often draws from a
 * larger/pseudo-continuous set; 8 is enough to avoid the noticeable
 * axis-aligned bias a naive 4-direction (only `(±1, 0)`/`(0, ±1)`) table
 * would have, while staying a plain lookup table - no trig at sample time.
 */
const GRADIENTS: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Picks this lattice point's gradient direction, deterministically, via
 * {@link hashLatticePoint}.
 *
 * @param seed - This channel's seed.
 * @param latticeX - Lattice point X coordinate (integer, may be negative).
 * @param latticeY - Lattice point Y coordinate (integer, may be negative).
 * @returns A unit vector from {@link GRADIENTS}.
 */
function gradientAt(seed: number, latticeX: number, latticeY: number): readonly [number, number] {
    const index = Math.floor(hashLatticePoint(seed, latticeX, latticeY) * GRADIENTS.length);
    return GRADIENTS[Math.min(index, GRADIENTS.length - 1)];
}

/**
 * Dot product of a lattice point's gradient direction with the offset vector
 * from that lattice point to the sample position - Perlin noise's core
 * building block.
 *
 * @param seed - This channel's seed.
 * @param latticeX - Lattice point X coordinate.
 * @param latticeY - Lattice point Y coordinate.
 * @param sampleX - Sample position X, in the same (frequency-scaled) units as `latticeX`.
 * @param sampleY - Sample position Y, in the same (frequency-scaled) units as `latticeY`.
 * @returns The dot product.
 */
function dotGridGradient(seed: number, latticeX: number, latticeY: number, sampleX: number, sampleY: number): number {
    const [gx, gy] = gradientAt(seed, latticeX, latticeY);
    return (sampleX - latticeX) * gx + (sampleY - latticeY) * gy;
}

/**
 * Samples classic Perlin (gradient) noise: interpolates the dot products of
 * each of the four surrounding lattice points' gradient direction with the
 * offset to `(x, y) * frequency`.
 *
 * Unlike {@link sampleNoise2d} (bilinearly-interpolated *value* noise, whose
 * corners hold plain scalars), this is naturally signed and centred on `0`
 * with **no flat plateaus**: a value-noise cell can end up nearly constant
 * across its interior whenever two adjacent corners happen to hash to
 * similar values (the same effect that makes plain `sampleNoise2d` values
 * concentrate near their own midpoint - see the grass-variety and river-ridge
 * sections of `plans/terrain-generation.md`), and wherever that happens, a
 * `1 - abs(...)` ridge computed from it stays elevated over an *area*, not a
 * line - a "noodle" feature (a river) built from that reads as a blobby
 * "pancake" instead. Gradient noise's zero-crossings don't have this
 * problem: since each lattice point's contribution is a *plane* through that
 * point (the dot product with a fixed direction) rather than a *constant*,
 * two neighbouring points essentially never agree well enough to flatten a
 * whole cell, so the zero-crossing set stays a genuine, reliably thin curve.
 * This is the standard, well-known reason ridged/veined noise effects
 * (rivers, cracks, lightning) are built from gradient noise specifically,
 * not value noise.
 *
 * @param seed - This channel's seed (combine a world seed with a fixed
 * per-channel offset so different channels don't correlate with each other).
 * @param x - World tile X coordinate to sample at (absolute, not chunk-local).
 * @param y - World tile Y coordinate to sample at (absolute, not chunk-local).
 * @param frequency - Noise cycles per tile, same meaning as {@link sampleNoise2d}'s.
 * @returns A value roughly in `[-1, 1]` (in practice rarely beyond `±0.7` with the 8-direction gradient table above), centred on `0`.
 */
export function sampleGradientNoise2d(seed: number, x: number, y: number, frequency: number): number {
    const sx = x * frequency;
    const sy = y * frequency;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = smootherstep(sx - x0);
    const ty = smootherstep(sy - y0);

    const n00 = dotGridGradient(seed, x0, y0, sx, sy);
    const n10 = dotGridGradient(seed, x1, y0, sx, sy);
    const n01 = dotGridGradient(seed, x0, y1, sx, sy);
    const n11 = dotGridGradient(seed, x1, y1, sx, sy);

    return lerp(lerp(n00, n10, tx), lerp(n01, n11, tx), ty);
}
