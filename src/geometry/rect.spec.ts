import { describe, it, expect } from "vitest";
import { pointInRect, rectsEqual, Rect } from "./rect";

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
