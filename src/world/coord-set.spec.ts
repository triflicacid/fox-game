import {describe, expect, it} from "vitest";
import {CoordMap, CoordSet} from "./coord-set";

describe("CoordSet", () => {
    describe("has / add / size", () => {
        it("starts empty", () => {
            expect(new CoordSet().size).toBe(0);
        });

        it("reports has() false for a coordinate not yet added", () => {
            expect(new CoordSet().has(0, 0)).toBe(false);
        });

        it("reports has() true after adding a coordinate", () => {
            const set = new CoordSet();
            set.add(3, 7);
            expect(set.has(3, 7)).toBe(true);
        });

        it("increments size on each unique add", () => {
            const set = new CoordSet();
            set.add(0, 0);
            set.add(1, 0);
            set.add(0, 1);
            expect(set.size).toBe(3);
        });

        it("does not duplicate a coordinate added twice", () => {
            const set = new CoordSet();
            set.add(5, 5);
            set.add(5, 5);
            expect(set.size).toBe(1);
        });

        it("treats (x, y) and (y, x) as distinct when x !== y", () => {
            const set = new CoordSet();
            set.add(1, 2);
            expect(set.has(2, 1)).toBe(false);
        });

        it("supports negative coordinates", () => {
            const set = new CoordSet();
            set.add(-100, -200);
            expect(set.has(-100, -200)).toBe(true);
            expect(set.has(100, 200)).toBe(false);
        });

        it("supports large coordinates near the boundary", () => {
            const set = new CoordSet();
            set.add(8_388_607, 8_388_607);
            expect(set.has(8_388_607, 8_388_607)).toBe(true);
        });

        it("returns this from add for chaining", () => {
            const set = new CoordSet();
            expect(set.add(0, 0)).toBe(set);
        });
    });

    describe("iteration", () => {
        it("iterates in insertion order", () => {
            const set = new CoordSet();
            set.add(3, 1);
            set.add(0, 0);
            set.add(2, 5);
            expect([...set]).toEqual([[3, 1], [0, 0], [2, 5]]);
        });

        it("does not yield a duplicate when the same coordinate is added twice", () => {
            const set = new CoordSet();
            set.add(1, 1);
            set.add(1, 1);
            expect([...set]).toEqual([[1, 1]]);
        });

        it("yields nothing for an empty set", () => {
            expect([...new CoordSet()]).toEqual([]);
        });
    });

    describe("equals", () => {
        it("returns true for two empty sets", () => {
            expect(new CoordSet().equals(new CoordSet())).toBe(true);
        });

        it("returns true when both sets contain the same coordinates", () => {
            const a = new CoordSet();
            a.add(1, 2); a.add(3, 4);
            const b = new CoordSet();
            b.add(3, 4); b.add(1, 2);
            expect(a.equals(b)).toBe(true);
        });

        it("returns false when sizes differ", () => {
            const a = new CoordSet();
            a.add(0, 0);
            expect(a.equals(new CoordSet())).toBe(false);
        });

        it("returns false when same size but different coordinates", () => {
            const a = new CoordSet();
            a.add(1, 0);
            const b = new CoordSet();
            b.add(0, 1);
            expect(a.equals(b)).toBe(false);
        });

        it("returns true when compared against itself", () => {
            const a = new CoordSet();
            a.add(5, 5);
            expect(a.equals(a)).toBe(true);
        });
    });

    describe("bounds validation", () => {
        it("throws RangeError when x is exactly MAX_COORD (8_388_608)", () => {
            expect(() => new CoordSet().add(8_388_608, 0)).toThrow(RangeError);
        });

        it("throws RangeError when y is exactly MAX_COORD (8_388_608)", () => {
            expect(() => new CoordSet().add(0, 8_388_608)).toThrow(RangeError);
        });

        it("throws RangeError when x is below -MAX_COORD (-8_388_608)", () => {
            expect(() => new CoordSet().add(-8_388_609, 0)).toThrow(RangeError);
        });

        it("throws RangeError for has() with out-of-range coordinates", () => {
            expect(() => new CoordSet().has(0, 9_000_000)).toThrow(RangeError);
        });
    });
});

describe("CoordMap", () => {
    describe("set / get / has / size", () => {
        it("starts empty", () => {
            expect(new CoordMap<number>().size).toBe(0);
        });

        it("returns undefined for a coordinate not set", () => {
            expect(new CoordMap<string>().get(0, 0)).toBeUndefined();
        });

        it("returns the value after set", () => {
            const map = new CoordMap<number>();
            map.set(4, 9, 42);
            expect(map.get(4, 9)).toBe(42);
        });

        it("reports has() true after set", () => {
            const map = new CoordMap<boolean>();
            map.set(-1, -1, true);
            expect(map.has(-1, -1)).toBe(true);
        });

        it("reports has() false for a coordinate not set", () => {
            expect(new CoordMap<number>().has(0, 0)).toBe(false);
        });

        it("overwrites an existing value at the same coordinate", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(0, 0, 99);
            expect(map.get(0, 0)).toBe(99);
            expect(map.size).toBe(1);
        });

        it("increments size for each unique coordinate", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(1, 0, 2);
            map.set(0, 1, 3);
            expect(map.size).toBe(3);
        });

        it("treats (x, y) and (y, x) as distinct when x !== y", () => {
            const map = new CoordMap<number>();
            map.set(1, 2, 10);
            expect(map.get(2, 1)).toBeUndefined();
        });

        it("returns this from set for chaining", () => {
            const map = new CoordMap<number>();
            expect(map.set(0, 0, 1)).toBe(map);
        });
    });

    describe("delete", () => {
        it("returns false when the coordinate is not present", () => {
            expect(new CoordMap<number>().delete(0, 0)).toBe(false);
        });

        it("returns true and removes the entry", () => {
            const map = new CoordMap<number>();
            map.set(1, 2, 99);
            expect(map.delete(1, 2)).toBe(true);
            expect(map.has(1, 2)).toBe(false);
            expect(map.size).toBe(0);
        });

        it("removes the entry from iteration order", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(1, 0, 2);
            map.set(2, 0, 3);
            map.delete(1, 0);
            expect([...map.keys()]).toEqual([[0, 0], [2, 0]]);
        });

        it("delete then set moves the entry to the end of insertion order", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(1, 0, 2);
            map.set(2, 0, 3);
            map.delete(0, 0);
            map.set(0, 0, 1);
            expect([...map.keys()]).toEqual([[1, 0], [2, 0], [0, 0]]);
        });
    });

    describe("clear", () => {
        it("empties the map", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(1, 1, 2);
            map.clear();
            expect(map.size).toBe(0);
            expect(map.has(0, 0)).toBe(false);
            expect([...map.keys()]).toEqual([]);
        });
    });

    describe("keys / values", () => {
        it("keys() iterates in insertion order", () => {
            const map = new CoordMap<string>();
            map.set(3, 1, "a");
            map.set(0, 0, "b");
            map.set(2, 5, "c");
            expect([...map.keys()]).toEqual([[3, 1], [0, 0], [2, 5]]);
        });

        it("values() iterates in insertion order", () => {
            const map = new CoordMap<string>();
            map.set(3, 1, "a");
            map.set(0, 0, "b");
            map.set(2, 5, "c");
            expect([...map.values()]).toEqual(["a", "b", "c"]);
        });

        it("values() skips entries deleted before they are yielded", () => {
            const map = new CoordMap<number>();
            map.set(0, 0, 1);
            map.set(1, 0, 2);
            map.set(2, 0, 3);
            const seen: number[] = [];
            for (const v of map.values()) {
                seen.push(v);
                if (v === 2) map.delete(2, 0); // delete (2,0) before it is reached
            }
            expect(seen).toEqual([1, 2]); // (2,0) was deleted before being yielded
        });
    });

    describe("bounds validation", () => {
        it("throws RangeError when x is out of range on set", () => {
            expect(() => new CoordMap<number>().set(8_388_608, 0, 1)).toThrow(RangeError);
        });

        it("throws RangeError when y is out of range on get", () => {
            expect(() => new CoordMap<number>().get(0, -9_000_000)).toThrow(RangeError);
        });
    });
});

