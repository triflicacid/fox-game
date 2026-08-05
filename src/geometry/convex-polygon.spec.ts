import { describe, it, expect } from "vitest";
import { Vector2d } from "./vector2d";
import { ConvexPolygon, convexPolygonsIntersect, minimumTranslationVector, rectPolygon } from "./convex-polygon";
import { requireNonNull } from "../util";

/** Builds a {@link ConvexPolygon} from plain `[x, y]` pairs, for terser test fixtures. */
function polygon(...points: readonly (readonly [number, number])[]): ConvexPolygon {
    return points.map(([x, y]) => new Vector2d(x, y));
}

/** Translates every vertex of `polygon` by `offset`. */
function translate(polygon: ConvexPolygon, offset: Vector2d): ConvexPolygon {
    return polygon.map((point) => point.add(offset));
}

describe("rectPolygon", () => {
    it("returns the four corners clockwise from the top-left, in canvas (y-down) space", () => {
        const result = rectPolygon(10, 20, 30, 40);
        expect(result).toEqual([
            new Vector2d(10, 20),
            new Vector2d(40, 20),
            new Vector2d(40, 60),
            new Vector2d(10, 60),
        ]);
    });

    it("handles a zero-width/height rectangle (degenerates to a single repeated point)", () => {
        const result = rectPolygon(5, 5, 0, 0);
        expect(result).toEqual([
            new Vector2d(5, 5),
            new Vector2d(5, 5),
            new Vector2d(5, 5),
            new Vector2d(5, 5),
        ]);
    });

    it("handles negative width/height by producing corners past the origin corner", () => {
        const result = rectPolygon(10, 10, -5, -5);
        expect(result).toEqual([
            new Vector2d(10, 10),
            new Vector2d(5, 10),
            new Vector2d(5, 5),
            new Vector2d(10, 5),
        ]);
    });
});

describe("convexPolygonsIntersect", () => {
    describe("axis-aligned rectangles", () => {
        it("returns true for clearly overlapping rectangles", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(5, 5, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("returns true when one rectangle fully contains the other", () => {
            const outer = rectPolygon(0, 0, 20, 20);
            const inner = rectPolygon(5, 5, 5, 5);
            expect(convexPolygonsIntersect(outer, inner)).toBe(true);
            expect(convexPolygonsIntersect(inner, outer)).toBe(true);
        });

        it("returns true for two identical rectangles", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(0, 0, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("returns true for a polygon against itself", () => {
            const a = rectPolygon(3, 4, 7, 2);
            expect(convexPolygonsIntersect(a, a)).toBe(true);
        });

        it("returns false for rectangles separated along the X axis", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(20, 0, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("returns false for rectangles separated along the Y axis", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(0, 20, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("returns false for rectangles separated diagonally", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(20, 20, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("returns true for rectangles sharing exactly one edge (touching counts as overlap)", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(10, 0, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("returns true for rectangles sharing exactly one corner point", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(10, 10, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("returns false for rectangles separated by the smallest possible gap", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(10.0001, 0, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("is symmetric regardless of argument order", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(5, 5, 10, 10);
            const c = rectPolygon(50, 50, 10, 10);
            expect(convexPolygonsIntersect(a, b)).toBe(convexPolygonsIntersect(b, a));
            expect(convexPolygonsIntersect(a, c)).toBe(convexPolygonsIntersect(c, a));
        });
    });

    describe("triangles", () => {
        it("returns true for overlapping triangles", () => {
            const a = polygon([0, 0], [10, 0], [5, 10]);
            const b = polygon([5, 5], [15, 5], [10, 15]);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("returns false for disjoint triangles", () => {
            const a = polygon([0, 0], [10, 0], [5, 10]);
            const b = polygon([100, 100], [110, 100], [105, 110]);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("returns false for triangles pointing away from each other with overlapping bounding boxes", () => {
            // Both triangles sit inside the shared bounding box [0,10]x[0,10], but
            // one occupies the box's lower-left half and the other its upper-right
            // half, meeting only along the box's own diagonal - not each other.
            const a = polygon([0, 0], [10, 0], [0, 10]);
            const b = polygon([10, 10], [10, 1], [1, 10]);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });
    });

    describe("rotated (non-axis-aligned) polygons", () => {
        it("detects overlap between two diamonds (squares rotated 45deg)", () => {
            // |x-5|+|y-5| <= 5 and |x-9|+|y-9| <= 5: centres are Manhattan
            // distance 8 apart, within the radii's sum of 10, so they overlap.
            const a = polygon([5, 0], [10, 5], [5, 10], [0, 5]);
            const b = polygon([9, 4], [14, 9], [9, 14], [4, 9]);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("rejects two diamonds whose axis-aligned bounding boxes overlap but shapes don't", () => {
            // Two diamonds (L1 balls) of radius 5 centred 9 apart on both axes:
            // Manhattan distance between centres is 18 > 5+5, so the shapes
            // themselves never touch. Their AABBs ([-5,5]x[-5,5] and
            // [4,14]x[4,14]) DO overlap though, in [4,5]x[4,5] - so this only
            // passes if the diamonds' own (diagonal) edge normals are tested,
            // not just axis-aligned ones.
            const a = polygon([5, 0], [0, 5], [-5, 0], [0, -5]);
            const b = polygon([14, 9], [9, 14], [4, 9], [9, 4]);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("detects a diamond overlapping an axis-aligned square via the diamond's own edge normal", () => {
            const square = rectPolygon(0, 0, 10, 10);
            // Diamond centred at (17, 5): its leftmost vertex reaches x=10, just
            // touching the square's right edge.
            const diamond = polygon([17, -2], [24, 5], [17, 12], [10, 5]);
            expect(convexPolygonsIntersect(square, diamond)).toBe(true);
            expect(convexPolygonsIntersect(diamond, square)).toBe(true);
        });

        it("rejects a diamond just short of an axis-aligned square", () => {
            const square = rectPolygon(0, 0, 10, 10);
            const diamond = polygon([18, -2], [25, 5], [18, 12], [11, 5]);
            expect(convexPolygonsIntersect(square, diamond)).toBe(false);
        });
    });

    describe("degenerate polygons", () => {
        it("returns false when either polygon is empty", () => {
            const a = rectPolygon(0, 0, 10, 10);
            expect(convexPolygonsIntersect(a, [])).toBe(false);
            expect(convexPolygonsIntersect([], a)).toBe(false);
            expect(convexPolygonsIntersect([], [])).toBe(false);
        });

        it("returns false for a single-point polygon even when that point lies inside the other shape (below the 2-point minimum)", () => {
            const square = rectPolygon(0, 0, 10, 10);
            const point = polygon([5, 5]);
            expect(convexPolygonsIntersect(square, point)).toBe(false);
            expect(convexPolygonsIntersect(point, square)).toBe(false);
        });

        it("treats a repeated point (2+ identical vertices) as a point-in-polygon test", () => {
            const square = rectPolygon(0, 0, 10, 10);
            const insidePoint = polygon([5, 5], [5, 5], [5, 5]);
            const outsidePoint = polygon([15, 5], [15, 5], [15, 5]);
            expect(convexPolygonsIntersect(square, insidePoint)).toBe(true);
            expect(convexPolygonsIntersect(square, outsidePoint)).toBe(false);
        });

        it("treats a degenerate zero-length segment (2 identical points) the same way", () => {
            const square = rectPolygon(0, 0, 10, 10);
            const insideSegment = polygon([5, 5], [5, 5]);
            const outsideSegment = polygon([15, 5], [15, 5]);
            expect(convexPolygonsIntersect(square, insideSegment)).toBe(true);
            expect(convexPolygonsIntersect(square, outsideSegment)).toBe(false);
        });
    });

    describe("line segments (2-vertex polygons)", () => {
        it("detects two crossing segments", () => {
            const a = polygon([0, 0], [10, 10]);
            const b = polygon([0, 10], [10, 0]);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("rejects two parallel, non-overlapping segments", () => {
            const a = polygon([0, 0], [10, 0]);
            const b = polygon([0, 5], [10, 5]);
            expect(convexPolygonsIntersect(a, b)).toBe(false);
        });

        it("detects two collinear, overlapping segments", () => {
            const a = polygon([0, 0], [10, 0]);
            const b = polygon([5, 0], [15, 0]);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });

        it("known limitation: can't separate two collinear segments along their own shared line", () => {
            // A 2-vertex "polygon"'s only candidate axis is its edge's normal
            // (here, vertical, since both segments lie along y=0) - both
            // iterations of that edge give the same axis. Separating two
            // segments along their own line would need an axis pointing
            // *along* that line, which no edge normal here supplies. Real
            // polygons in this codebase (sprite bounds, tile squares) always
            // have 3+ vertices with edges in more than one direction, so this
            // gap never surfaces in practice - documented here rather than
            // silently relied upon.
            const a = polygon([0, 0], [10, 0]);
            const b = polygon([11, 0], [20, 0]);
            expect(convexPolygonsIntersect(a, b)).toBe(true);
        });
    });
});

describe("minimumTranslationVector", () => {
    describe("direction and magnitude", () => {
        it("pushes along the axis with the smaller overlap, not just any separating axis", () => {
            // a: x[0,10] y[0,10]. b: x[8,18] y[3,13]. Overlap is 2 on X
            // (10-8) but 7 on Y (10-3) - X must win.
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(8, 3, 10, 10);
            const result = minimumTranslationVector(a, b);
            expect(result?.x).toBeCloseTo(-2, 10);
            expect(result?.y).toBeCloseTo(0, 10);
        });

        it("pushes right when the obstacle is to the left", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(-8, 3, 10, 10);
            const result = minimumTranslationVector(a, b);
            expect(result?.x).toBeCloseTo(2, 10);
            expect(result?.y).toBeCloseTo(0, 10);
        });

        it("pushes down when the obstacle is above", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(3, -8, 10, 10);
            const result = minimumTranslationVector(a, b);
            expect(result?.x).toBeCloseTo(0, 10);
            expect(result?.y).toBeCloseTo(2, 10);
        });

        it("pushes up when the obstacle is below", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(3, 8, 10, 10);
            const result = minimumTranslationVector(a, b);
            expect(result?.x).toBeCloseTo(0, 10);
            expect(result?.y).toBeCloseTo(-2, 10);
        });

        it("returns a vector whose magnitude is the true minimum overlap for a non-square shape overlapping itself", () => {
            // Centres coincide exactly, so the push *direction* is an arbitrary
            // (but deterministic) tie-break - only the magnitude (the smaller
            // of the two axis overlaps, i.e. the height) is well-defined here.
            const a = rectPolygon(0, 0, 10, 4);
            const result = requireNonNull(minimumTranslationVector(a, a));
            expect(Math.hypot(result.x, result.y)).toBeCloseTo(4, 10);
        });
    });

    describe("actually separates the shapes", () => {
        it("translating a by the MTV plus a small epsilon leaves the shapes no longer overlapping", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(5, 5, 10, 10);
            const push = requireNonNull(minimumTranslationVector(a, b));

            const depth = Math.hypot(push.x, push.y);
            const withEpsilon = push.scale((depth + 0.01) / depth);
            expect(convexPolygonsIntersect(translate(a, withEpsilon), b)).toBe(false);
        });

        it("also separates two overlapping diamonds (non-axis-aligned shapes)", () => {
            const a = polygon([5, 0], [10, 5], [5, 10], [0, 5]);
            const b = polygon([9, 4], [14, 9], [9, 14], [4, 9]);
            const push = requireNonNull(minimumTranslationVector(a, b));

            const depth = Math.hypot(push.x, push.y);
            const withEpsilon = push.scale((depth + 0.01) / depth);
            expect(convexPolygonsIntersect(translate(a, withEpsilon), b)).toBe(false);
        });
    });

    describe("no overlap to resolve", () => {
        it("returns undefined for clearly separated rectangles", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(20, 0, 10, 10);
            expect(minimumTranslationVector(a, b)).toBeUndefined();
        });

        it("returns undefined for rectangles that only touch (zero-depth overlap needs no push)", () => {
            const a = rectPolygon(0, 0, 10, 10);
            const b = rectPolygon(10, 0, 10, 10);
            expect(minimumTranslationVector(a, b)).toBeUndefined();
        });

        it("returns undefined when either polygon is empty", () => {
            const a = rectPolygon(0, 0, 10, 10);
            expect(minimumTranslationVector(a, [])).toBeUndefined();
            expect(minimumTranslationVector([], a)).toBeUndefined();
        });

        it("returns undefined for a single-point polygon (below the 2-point minimum)", () => {
            const square = rectPolygon(0, 0, 10, 10);
            const point = polygon([5, 5]);
            expect(minimumTranslationVector(square, point)).toBeUndefined();
        });
    });
});
