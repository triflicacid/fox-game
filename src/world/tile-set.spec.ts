import {describe, expect, it} from "vitest";
import {TileMap, TileSet} from "./tile-set";

describe("TileSet", () => {
    describe("has / add / size", () => {
        it("starts empty", () => {
            expect(new TileSet().size).toBe(0);
        });

        it("reports has() false for a coordinate not yet added", () => {
            expect(new TileSet().has(0, 0)).toBe(false);
        });

        it("reports has() true after adding a coordinate", () => {
            const set = new TileSet();
            set.add(3, 7);
            expect(set.has(3, 7)).toBe(true);
        });

        it("increments size on each unique add", () => {
            const set = new TileSet();
            set.add(0, 0);
            set.add(1, 0);
            set.add(0, 1);
            expect(set.size).toBe(3);
        });

        it("does not duplicate a coordinate added twice", () => {
            const set = new TileSet();
            set.add(5, 5);
            set.add(5, 5);
            expect(set.size).toBe(1);
        });

        it("treats (x, y) and (y, x) as distinct when x !== y", () => {
            const set = new TileSet();
            set.add(1, 2);
            expect(set.has(2, 1)).toBe(false);
        });

        it("supports negative coordinates", () => {
            const set = new TileSet();
            set.add(-100, -200);
            expect(set.has(-100, -200)).toBe(true);
            expect(set.has(100, 200)).toBe(false);
        });

        it("supports large coordinates near the boundary", () => {
            const set = new TileSet();
            set.add(8_388_607, 8_388_607);
            expect(set.has(8_388_607, 8_388_607)).toBe(true);
        });

        it("returns this from add for chaining", () => {
            const set = new TileSet();
            expect(set.add(0, 0)).toBe(set);
        });
    });

    describe("iteration", () => {
        it("iterates in insertion order", () => {
            const set = new TileSet();
            set.add(3, 1);
            set.add(0, 0);
            set.add(2, 5);
            expect([...set]).toEqual([[3, 1], [0, 0], [2, 5]]);
        });

        it("does not yield a duplicate when the same coordinate is added twice", () => {
            const set = new TileSet();
            set.add(1, 1);
            set.add(1, 1);
            expect([...set]).toEqual([[1, 1]]);
        });

        it("yields nothing for an empty set", () => {
            expect([...new TileSet()]).toEqual([]);
        });
    });

    describe("bounds validation", () => {
        it("throws RangeError when x is exactly MAX_COORD (8_388_608)", () => {
            expect(() => new TileSet().add(8_388_608, 0)).toThrow(RangeError);
        });

        it("throws RangeError when y is exactly MAX_COORD (8_388_608)", () => {
            expect(() => new TileSet().add(0, 8_388_608)).toThrow(RangeError);
        });

        it("throws RangeError when x is below -MAX_COORD (-8_388_608)", () => {
            expect(() => new TileSet().add(-8_388_609, 0)).toThrow(RangeError);
        });

        it("throws RangeError for has() with out-of-range coordinates", () => {
            expect(() => new TileSet().has(0, 9_000_000)).toThrow(RangeError);
        });
    });
    describe("equals", () => {
        it("returns true for two empty sets", () => {
            expect(new TileSet().equals(new TileSet())).toBe(true);
        });

        it("returns true when both sets contain the same coordinates", () => {
            const a = new TileSet();
            a.add(1, 2); a.add(3, 4);
            const b = new TileSet();
            b.add(3, 4); b.add(1, 2); // different insertion order
            expect(a.equals(b)).toBe(true);
        });

        it("returns false when sizes differ", () => {
            const a = new TileSet();
            a.add(0, 0);
            expect(a.equals(new TileSet())).toBe(false);
        });

        it("returns false when same size but different coordinates", () => {
            const a = new TileSet();
            a.add(1, 0);
            const b = new TileSet();
            b.add(0, 1);
            expect(a.equals(b)).toBe(false);
        });

        it("returns true when compared against itself", () => {
            const a = new TileSet();
            a.add(5, 5);
            expect(a.equals(a)).toBe(true);
        });
    });
});


describe("TileMap", () => {
    describe("set / get / has / size", () => {
        it("starts empty", () => {
            expect(new TileMap<number>().size).toBe(0);
        });

        it("returns undefined for a coordinate not set", () => {
            expect(new TileMap<string>().get(0, 0)).toBeUndefined();
        });

        it("returns the value after set", () => {
            const map = new TileMap<number>();
            map.set(4, 9, 42);
            expect(map.get(4, 9)).toBe(42);
        });

        it("reports has() true after set", () => {
            const map = new TileMap<boolean>();
            map.set(-1, -1, true);
            expect(map.has(-1, -1)).toBe(true);
        });

        it("reports has() false for a coordinate not set", () => {
            expect(new TileMap<number>().has(0, 0)).toBe(false);
        });

        it("overwrites an existing value at the same coordinate", () => {
            const map = new TileMap<number>();
            map.set(0, 0, 1);
            map.set(0, 0, 99);
            expect(map.get(0, 0)).toBe(99);
            expect(map.size).toBe(1);
        });

        it("increments size for each unique coordinate", () => {
            const map = new TileMap<number>();
            map.set(0, 0, 1);
            map.set(1, 0, 2);
            map.set(0, 1, 3);
            expect(map.size).toBe(3);
        });

        it("treats (x, y) and (y, x) as distinct when x !== y", () => {
            const map = new TileMap<number>();
            map.set(1, 2, 10);
            expect(map.get(2, 1)).toBeUndefined();
        });

        it("returns this from set for chaining", () => {
            const map = new TileMap<number>();
            expect(map.set(0, 0, 1)).toBe(map);
        });
    });

    describe("bounds validation", () => {
        it("throws RangeError when x is out of range on set", () => {
            expect(() => new TileMap<number>().set(8_388_608, 0, 1)).toThrow(RangeError);
        });

        it("throws RangeError when y is out of range on get", () => {
            expect(() => new TileMap<number>().get(0, -9_000_000)).toThrow(RangeError);
        });
    });
});

