import {sampleFbm2d, sampleGradientNoise2d, sampleNoise2d} from "../noise";

/**
 * A named, world-space noise channel. Every implementation normalizes its
 * output to `[0, 1)`.
 */
export interface NoiseField {
    /** Name other systems reference this field by. */
    readonly name: string;

    /**
     * Samples this field at an absolute world tile coordinate.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns A value in `[0, 1)`.
     */
    sample(worldX: number, worldY: number): number;
}

/** A field that samples to the same fixed value everywhere. */
export class ConstantField implements NoiseField {
    /**
     * @param name - This field's stable name.
     * @param value - The value every sample returns.
     */
    public constructor(public readonly name: string, private readonly value: number) {
    }

    public sample(): number {
        return this.value;
    }
}

/** A field backed by {@link sampleNoise2d} (bilinearly-interpolated value noise). */
export class ValueNoiseField implements NoiseField {
    private readonly seed: number;

    /**
     * @param name - This field's stable name.
     * @param worldSeed - The world's seed.
     * @param seedOffset - Per-field offset so this field doesn't correlate with others sharing `worldSeed`.
     * @param frequency - Noise cycles per tile - see {@link sampleNoise2d}.
     */
    public constructor(public readonly name: string, worldSeed: number, seedOffset: number, private readonly frequency: number) {
        this.seed = worldSeed + seedOffset;
    }

    public sample(worldX: number, worldY: number): number {
        return sampleNoise2d(this.seed, worldX, worldY, this.frequency);
    }
}

/** A field backed by {@link sampleGradientNoise2d} (real Perlin/gradient noise), remapped from its natural `[-1, 1]` range into `[0, 1)`. */
export class PerlinNoiseField implements NoiseField {
    private readonly seed: number;

    /**
     * @param name - This field's stable name.
     * @param worldSeed - The world's seed.
     * @param seedOffset - Per-field offset so this field doesn't correlate with others sharing `worldSeed`.
     * @param frequency - Noise cycles per tile - see {@link sampleGradientNoise2d}.
     */
    public constructor(public readonly name: string, worldSeed: number, seedOffset: number, private readonly frequency: number) {
        this.seed = worldSeed + seedOffset;
    }

    public sample(worldX: number, worldY: number): number {
        return (sampleGradientNoise2d(this.seed, worldX, worldY, this.frequency) + 1) / 2;
    }
}

/** A field backed by {@link sampleFbm2d} (multi-octave value noise), for shapes that need less pockmarking than a single octave gives. */
export class FbmField implements NoiseField {
    private readonly seed: number;

    /**
     * @param name - This field's stable name.
     * @param worldSeed - The world's seed.
     * @param seedOffset - Per-field offset so this field doesn't correlate with others sharing `worldSeed`.
     * @param frequency - Base noise cycles per tile - see {@link sampleFbm2d}.
     * @param octaves - Number of octaves to sum - see {@link sampleFbm2d}.
     */
    public constructor(
        public readonly name: string,
        worldSeed: number,
        seedOffset: number,
        private readonly frequency: number,
        private readonly octaves: number,
    ) {
        this.seed = worldSeed + seedOffset;
    }

    public sample(worldX: number, worldY: number): number {
        return sampleFbm2d(this.seed, worldX, worldY, this.frequency, this.octaves);
    }
}
