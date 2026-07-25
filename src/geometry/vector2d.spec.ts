import { describe, it, expect } from "vitest";
import { Vector2d } from "./vector2d";
import { COMPASS_DIRECTIONS, CompassDirection } from "./direction";

describe("Vector2d", () => {
    describe("fromDirection", () => {
        it.each(COMPASS_DIRECTIONS)("unit vector for %s has length approximately 1", (dir: CompassDirection) => {
            const v = Vector2d.fromDirection(dir);
            const length = Math.sqrt(v.x ** 2 + v.y ** 2);
            expect(length).toBeCloseTo(1, 10);
        });

        it("north is (0, -1)", () => {
            const v = Vector2d.fromDirection("N");
            expect(v.x).toBe(0);
            expect(v.y).toBe(-1);
        });

        it("east is (1, 0)", () => {
            const v = Vector2d.fromDirection("E");
            expect(v.x).toBe(1);
            expect(v.y).toBe(0);
        });

        it("south is (0, 1)", () => {
            const v = Vector2d.fromDirection("S");
            expect(v.x).toBe(0);
            expect(v.y).toBe(1);
        });

        it("west is (-1, 0)", () => {
            const v = Vector2d.fromDirection("W");
            expect(v.x).toBe(-1);
            expect(v.y).toBe(0);
        });
    });

    describe("add", () => {
        it("returns the component-wise sum", () => {
            const a = new Vector2d(1, 2);
            const b = new Vector2d(3, 4);
            const result = a.add(b);
            expect(result.x).toBe(4);
            expect(result.y).toBe(6);
        });

        it("returns a new vector and leaves both operands unchanged", () => {
            const a = new Vector2d(1, 2);
            const b = new Vector2d(3, 4);
            const result = a.add(b);
            expect(result).not.toBe(a);
            expect(result).not.toBe(b);
            expect(a.x).toBe(1);
            expect(a.y).toBe(2);
            expect(b.x).toBe(3);
            expect(b.y).toBe(4);
        });
    });

    describe("subtract", () => {
        it("returns the component-wise difference", () => {
            const a = new Vector2d(5, 7);
            const b = new Vector2d(2, 3);
            const result = a.subtract(b);
            expect(result.x).toBe(3);
            expect(result.y).toBe(4);
        });

        it("returns a new vector and leaves both operands unchanged", () => {
            const a = new Vector2d(5, 7);
            const b = new Vector2d(2, 3);
            const result = a.subtract(b);
            expect(result).not.toBe(a);
            expect(result).not.toBe(b);
            expect(a.x).toBe(5);
            expect(b.x).toBe(2);
        });
    });

    describe("scale", () => {
        it("multiplies both components by the factor", () => {
            const v = new Vector2d(3, 4);
            const result = v.scale(2);
            expect(result.x).toBe(6);
            expect(result.y).toBe(8);
        });

        it("scales by a negative factor", () => {
            const v = new Vector2d(3, 4);
            const result = v.scale(-1);
            expect(result.x).toBe(-3);
            expect(result.y).toBe(-4);
        });

        it("scales by zero produces the zero vector", () => {
            const v = new Vector2d(3, 4);
            const result = v.scale(0);
            expect(result.x).toBe(0);
            expect(result.y).toBe(0);
        });

        it("returns a new vector and leaves the original unchanged", () => {
            const v = new Vector2d(3, 4);
            const result = v.scale(2);
            expect(result).not.toBe(v);
            expect(v.x).toBe(3);
            expect(v.y).toBe(4);
        });
    });

    describe("ZERO", () => {
        it("is (0, 0)", () => {
            expect(Vector2d.ZERO.x).toBe(0);
            expect(Vector2d.ZERO.y).toBe(0);
        });
    });
});

