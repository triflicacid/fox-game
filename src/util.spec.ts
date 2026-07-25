import { describe, it, expect } from "vitest";
import { randomElement, requireNonNull } from "./util";

describe("randomElement", () => {
    it("returns undefined for an empty array", () => {
        expect(randomElement([])).toBeUndefined();
    });

    it("returns the only element of a single-element array", () => {
        expect(randomElement([42])).toBe(42);
    });

    it("returns an element that belongs to the input array", () => {
        const arr = [1, 2, 3, 4, 5];

        const result = randomElement(arr);

        expect(arr).toContain(result);
    });

    it("can return any element across many calls", () => {
        const arr = ["a", "b", "c"];
        const seen = new Set<string>();

        for (let i = 0; i < 300; i++) {
            const el = randomElement(arr);
            if (el !== undefined) seen.add(el);
        }

        expect(seen).toEqual(new Set(arr));
    });
});

describe("requireNonNull", () => {
    it("returns the value when it is non-null", () => {
        expect(requireNonNull(42)).toBe(42);
    });

    it("returns the value when it is a non-empty string", () => {
        expect(requireNonNull("hello")).toBe("hello");
    });

    it("returns the value when it is an object", () => {
        const obj = { x: 1 };
        expect(requireNonNull(obj)).toBe(obj);
    });

    it("throws a TypeError for null", () => {
        expect(() => requireNonNull(null)).toThrow(TypeError);
    });

    it("throws a TypeError for undefined", () => {
        expect(() => requireNonNull(undefined)).toThrow(TypeError);
    });
});


