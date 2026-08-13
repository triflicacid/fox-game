import { describe, it, expect } from "vitest";
import { pointInRect, rectIntersectionArea, rectsEqual, Rect } from "./rect";

const rect: Rect = { x: 10, y: 20, w: 100, h: 50 };

describe("pointInRect", () => {
    it("returns true for a point strictly inside the rect", () => {
        expect(pointInRect(50, 40, rect)).toBe(true);
    });

    it.each([
        ["top-left corner", 10, 20],
        ["top-right corner", 110, 20],
        ["bottom-left corner", 10, 70],
        ["bottom-right corner", 110, 70],
        ["left edge", 10, 45],
        ["right edge", 110, 45],
        ["top edge", 50, 20],
        ["bottom edge", 50, 70],
    ])("returns true for point on the %s", (_label, x, y) => {
        expect(pointInRect(x, y, rect)).toBe(true);
    });

    it.each([
        ["left of rect", 9, 40],
        ["right of rect", 111, 40],
        ["above rect", 50, 19],
        ["below rect", 50, 71],
    ])("returns false for point %s", (_label, x, y) => {
        expect(pointInRect(x, y, rect)).toBe(false);
    });
});

describe("rectsEqual", () => {
    it("returns true for two rects with identical properties", () => {
        expect(rectsEqual({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
    });

    it.each([
        ["x differs", { x: 0, y: 2, w: 3, h: 4 }],
        ["y differs", { x: 1, y: 0, w: 3, h: 4 }],
        ["w differs", { x: 1, y: 2, w: 0, h: 4 }],
        ["h differs", { x: 1, y: 2, w: 3, h: 0 }],
    ])("returns false when %s", (_label, b) => {
        expect(rectsEqual({ x: 1, y: 2, w: 3, h: 4 }, b)).toBe(false);
    });
});

describe("rectIntersectionArea", () => {
    it("returns the overlap area for two rects that partially overlap", () => {
        expect(rectIntersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    });

    it("returns the full area when one rect wholly contains the other", () => {
        expect(rectIntersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 4, h: 4 })).toBe(16);
    });

    it("returns 0 for rects that don't touch", () => {
        expect(rectIntersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(0);
    });

    it("returns 0 for rects that only touch along an edge", () => {
        expect(rectIntersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0);
    });
});
