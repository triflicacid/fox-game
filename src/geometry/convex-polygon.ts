import {Vector2d} from "./vector2d";

/** A convex polygon's vertices, in world pixels, in either winding order. */
export type ConvexPolygon = readonly Vector2d[];

/**
 * Builds the four-corner polygon for an axis-aligned rectangle.
 *
 * @param x - Left edge, in world pixels.
 * @param y - Top edge, in world pixels.
 * @param w - Width, in world pixels.
 * @param h - Height, in world pixels.
 * @returns The rectangle's four corners, clockwise from the top-left.
 */
export function rectPolygon(x: number, y: number, w: number, h: number): ConvexPolygon {
    return [
        new Vector2d(x, y),
        new Vector2d(x + w, y),
        new Vector2d(x + w, y + h),
        new Vector2d(x, y + h),
    ];
}

/**
 * Projects `polygon` onto the axis `(axisX, axisY)`, which need not be
 * normalised.
 *
 * @param polygon - Polygon to project.
 * @param axisX - Axis X component.
 * @param axisY - Axis Y component.
 * @returns The projection's `[min, max]` extent along the axis.
 */
function projectOntoAxis(polygon: ConvexPolygon, axisX: number, axisY: number): [min: number, max: number] {
    let min = Infinity;
    let max = -Infinity;
    for (const point of polygon) {
        const dot = point.x * axisX + point.y * axisY;
        min = Math.min(min, dot);
        max = Math.max(max, dot);
    }
    return [min, max];
}

/**
 * Whether every edge normal of `edgePolygon` separates `a` from `b` - i.e.
 * whether `edgePolygon`'s own edges alone prove the two polygons don't
 * overlap.
 *
 * @param edgePolygon - Polygon whose edges supply the candidate axes.
 * @param a - First polygon to test.
 * @param b - Second polygon to test.
 * @returns `true` if some edge of `edgePolygon` separates `a` and `b`.
 */
function hasSeparatingAxis(edgePolygon: ConvexPolygon, a: ConvexPolygon, b: ConvexPolygon): boolean {
    for (let i = 0; i < edgePolygon.length; i++) {
        const p1 = edgePolygon[i];
        const p2 = edgePolygon[(i + 1) % edgePolygon.length];
        // Outward normal of edge (p1 -> p2): perpendicular to the edge itself.
        const axisX = -(p2.y - p1.y);
        const axisY = p2.x - p1.x;

        const [aMin, aMax] = projectOntoAxis(a, axisX, axisY);
        const [bMin, bMax] = projectOntoAxis(b, axisX, axisY);
        if (aMax < bMin || bMax < aMin) {
            return true;
        }
    }
    return false;
}

/**
 * Whether two convex polygons overlap, via the Separating Axis Theorem: two
 * convex shapes are disjoint if and only if some axis perpendicular to one
 * of either shape's edges separates their projections. Basic - no
 * containment/depth/contact-point info, just yes-or-no overlap.
 *
 * @param a - First polygon.
 * @param b - Second polygon.
 * @returns `true` if `a` and `b` overlap (including touching exactly at an edge/vertex).
 */
export function convexPolygonsIntersect(a: ConvexPolygon, b: ConvexPolygon): boolean {
    if (a.length < 2 || b.length < 2) {
        return false;
    }
    return !hasSeparatingAxis(a, a, b) && !hasSeparatingAxis(b, a, b);
}
