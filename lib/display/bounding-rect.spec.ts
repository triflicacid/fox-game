import {describe, expect, it} from "vitest";
import {expandRect, pointInRect, rectContains, rectsEqual, unionRect} from "./bounding-rect";

describe("bounding-rect", () => {
    it("checks point inclusion including edges", () => {
        const rect = {x: 10, y: 20, w: 5, h: 4};
        expect(pointInRect(10, 20, rect)).toBe(true);
        expect(pointInRect(15, 24, rect)).toBe(true);
        expect(pointInRect(9, 20, rect)).toBe(false);
    });

    it("compares rectangle equality", () => {
        expect(rectsEqual({x: 1, y: 2, w: 3, h: 4}, {x: 1, y: 2, w: 3, h: 4})).toBe(true);
        expect(rectsEqual({x: 1, y: 2, w: 3, h: 4}, {x: 1, y: 2, w: 4, h: 4})).toBe(false);
    });

    it("checks containment and unions", () => {
        const outer = {x: 0, y: 0, w: 10, h: 10};
        const inner = {x: 2, y: 3, w: 4, h: 2};
        expect(rectContains(outer, inner)).toBe(true);
        expect(unionRect({x: 1, y: 1, w: 4, h: 3}, {x: 3, y: -1, w: 5, h: 4})).toEqual({x: 1, y: -1, w: 7, h: 5});
    });

    it("expands and shrinks with spacing", () => {
        const rect = {x: 5, y: 10, w: 20, h: 8};
        expect(expandRect(rect, [1, 2, 3, 4])).toEqual({x: 1, y: 9, w: 26, h: 12});
        expect(expandRect(rect, [-1, -2, -3, -4])).toEqual({x: 9, y: 11, w: 14, h: 4});
    });
});

