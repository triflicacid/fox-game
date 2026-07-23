import {describe, expect, it} from "vitest";
import {resolveSpacing, spacing, ZERO_SPACING} from "./spacing";

describe("spacing", () => {
    it("resolves undefined to ZERO_SPACING", () => {
        expect(resolveSpacing(undefined)).toBe(ZERO_SPACING);
    });

    it("resolves number shorthand", () => {
        expect(resolveSpacing(3)).toEqual([3, 3, 3, 3]);
    });

    it("resolves [vertical, horizontal] shorthand", () => {
        expect(resolveSpacing([2, 5])).toEqual([2, 5, 2, 5]);
    });

    it("passes through full tuple", () => {
        expect(resolveSpacing([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    });

    it("builds shorthand values", () => {
        expect(spacing(4)).toEqual([4]);
        expect(spacing(4, 6)).toEqual([4, 6]);
        expect(spacing(1, 2, 3, 4)).toEqual([1, 2, 3, 4]);
    });
});

