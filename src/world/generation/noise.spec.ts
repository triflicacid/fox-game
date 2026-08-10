import {describe, expect, it} from "vitest";
import {sampleFbm2d, sampleGradientNoise2d, sampleNoise2d} from "./noise";

const COORDS: [number, number][] = [
    [0, 0],
    [7, 3],
    [-5, 12],
    [1000, -999],
];

describe("sampleNoise2d", () => {
    it("is deterministic for the same seed and coordinate", () => {
        for (const [x, y] of COORDS) {
            expect(sampleNoise2d(42, x, y, 0.1)).toBe(sampleNoise2d(42, x, y, 0.1));
        }
    });

    it("returns finite values in [0, 1)", () => {
        for (const [x, y] of COORDS) {
            const v = sampleNoise2d(42, x, y, 0.1);
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("produces different values for different seeds", () => {
        expect(sampleNoise2d(1, 7, 3, 0.1)).not.toBe(sampleNoise2d(99999, 7, 3, 0.1));
    });

    it("produces different values for different coordinates", () => {
        expect(sampleNoise2d(42, 0, 0, 0.1)).not.toBe(sampleNoise2d(42, 7, 3, 0.1));
    });
});

describe("sampleFbm2d", () => {
    it("is deterministic for the same seed and coordinate", () => {
        for (const [x, y] of COORDS) {
            expect(sampleFbm2d(42, x, y, 0.1, 4)).toBe(sampleFbm2d(42, x, y, 0.1, 4));
        }
    });

    it("returns finite values in [0, 1)", () => {
        for (const [x, y] of COORDS) {
            const v = sampleFbm2d(42, x, y, 0.1, 4);
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("produces different values for different seeds", () => {
        expect(sampleFbm2d(1, 7, 3, 0.1, 4)).not.toBe(sampleFbm2d(99999, 7, 3, 0.1, 4));
    });

    it("produces different values for different coordinates", () => {
        expect(sampleFbm2d(42, 0, 0, 0.1, 4)).not.toBe(sampleFbm2d(42, 7, 3, 0.1, 4));
    });
});

describe("sampleGradientNoise2d", () => {
    it("is deterministic for the same seed and coordinate", () => {
        for (const [x, y] of COORDS) {
            expect(sampleGradientNoise2d(42, x, y, 0.1)).toBe(sampleGradientNoise2d(42, x, y, 0.1));
        }
    });

    it("returns finite values", () => {
        for (const [x, y] of COORDS) {
            expect(Number.isFinite(sampleGradientNoise2d(42, x, y, 0.1))).toBe(true);
        }
    });

    it("produces different values for different seeds at non-lattice coordinates", () => {
        // Avoid integer lattice points (e.g. x*freq = integer) where gradient
        // dot products are always 0 regardless of seed.
        expect(sampleGradientNoise2d(1, 7, 3, 0.1)).not.toBe(sampleGradientNoise2d(99999, 7, 3, 0.1));
    });

    it("produces different values for different coordinates", () => {
        expect(sampleGradientNoise2d(42, 7, 3, 0.1)).not.toBe(sampleGradientNoise2d(42, 3, 7, 0.1));
    });
});

