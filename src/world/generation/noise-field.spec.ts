import { describe, it, expect } from "vitest";
import { ConstantField, ValueNoiseField, PerlinNoiseField, FbmField, NoiseField } from "./noise-field";

describe("ConstantField", () => {
    it("returns the same value for any coordinate", () => {
        const field: NoiseField = new ConstantField("flat", 0.5);

        expect(field.sample(0, 0)).toBe(0.5);
        expect(field.sample(100, -200)).toBe(0.5);
        expect(field.sample(-1, 999)).toBe(0.5);
    });

    it("exposes the name given at construction", () => {
        const field = new ConstantField("my-field", 0);
        expect(field.name).toBe("my-field");
    });
});

describe("ValueNoiseField", () => {
    it("is deterministic for the same seed and coordinate", () => {
        const a = new ValueNoiseField("v", 1234, 0, 0.1);
        const b = new ValueNoiseField("v", 1234, 0, 0.1);

        expect(a.sample(7, -3)).toBe(b.sample(7, -3));
    });

    it("returns values in [0, 1)", () => {
        const field = new ValueNoiseField("v", 42, 0, 0.05);

        for (const [x, y] of [[0, 0], [10, -10], [-50, 50], [1000, 1000]] as [number, number][]) {
            const v = field.sample(x, y);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("produces different values for different seeds at the same coordinate", () => {
        const a = new ValueNoiseField("v", 1, 0, 0.1);
        const b = new ValueNoiseField("v", 99999, 0, 0.1);

        expect(a.sample(5, 5)).not.toBe(b.sample(5, 5));
    });
});

describe("PerlinNoiseField", () => {
    it("is deterministic for the same seed and coordinate", () => {
        const a = new PerlinNoiseField("p", 7777, 0, 0.1);
        const b = new PerlinNoiseField("p", 7777, 0, 0.1);

        expect(a.sample(3, 9)).toBe(b.sample(3, 9));
    });

    it("returns values in [0, 1)", () => {
        const field = new PerlinNoiseField("p", 100, 0, 0.05);

        for (const [x, y] of [[0, 0], [20, -20], [-100, 100]] as [number, number][]) {
            const v = field.sample(x, y);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("produces different values for different seeds at the same coordinate", () => {
        const a = new PerlinNoiseField("p", 1, 0, 0.1);
        const b = new PerlinNoiseField("p", 55555, 0, 0.1);

        // Use non-lattice-aligned coordinates (7 * 0.1 = 0.7, 3 * 0.1 = 0.3)
        // to avoid integer lattice points where gradient noise is always 0.
        expect(a.sample(7, 3)).not.toBe(b.sample(7, 3));
    });
});

describe("FbmField", () => {
    it("is deterministic for the same seed and coordinate", () => {
        const a = new FbmField("f", 2222, 0, 0.1, 4);
        const b = new FbmField("f", 2222, 0, 0.1, 4);

        expect(a.sample(-5, 12)).toBe(b.sample(-5, 12));
    });

    it("returns values in [0, 1)", () => {
        const field = new FbmField("f", 300, 0, 0.05, 4);

        for (const [x, y] of [[0, 0], [30, -30], [-200, 200]] as [number, number][]) {
            const v = field.sample(x, y);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("produces different values for different seeds at the same coordinate", () => {
        const a = new FbmField("f", 1, 0, 0.1, 4);
        const b = new FbmField("f", 88888, 0, 0.1, 4);

        expect(a.sample(7, 7)).not.toBe(b.sample(7, 7));
    });
});


