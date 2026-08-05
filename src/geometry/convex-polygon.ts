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
 * overlap. One half of the {@link https://en.wikipedia.org/wiki/Hyperplane_separation_theorem | hyperplane separation theorem}
 * walk {@link convexPolygonsIntersect} does (the other half swaps which
 * polygon supplies the axes) - known in collision detection as the
 * Separating Axis Theorem (SAT).
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
 * Whether two convex polygons overlap, via the Separating Axis Theorem
 * (SAT) - an application of the {@link https://en.wikipedia.org/wiki/Hyperplane_separation_theorem | hyperplane separation theorem}
 * to {@link https://en.wikipedia.org/wiki/Convex_polygon | convex polygons}:
 * two convex shapes are disjoint if and only if some axis perpendicular to
 * one of either shape's edges separates their projections. Basic - no
 * containment/depth/contact-point info, just yes-or-no overlap - see
 * {@link minimumTranslationVector} for depth.
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

/** A polygon's vertex average - a representative interior-ish point, good enough for a convex shape to pick a push direction's sign. */
function centroid(polygon: ConvexPolygon): Vector2d {
    let sumX = 0;
    let sumY = 0;
    for (const point of polygon) {
        sumX += point.x;
        sumY += point.y;
    }
    return new Vector2d(sumX / polygon.length, sumY / polygon.length);
}

/**
 * The shortest vector that, added to every vertex of `a`, stops it
 * overlapping `b` - the Separating Axis Theorem's "minimum translation
 * vector" (MTV), a standard extension of the same {@link https://en.wikipedia.org/wiki/Hyperplane_separation_theorem | hyperplane separation theorem}
 * walk {@link convexPolygonsIntersect} uses (see also
 * {@link https://en.wikipedia.org/wiki/Collision_response | collision response}
 * more generally). Walks the same candidate axes as {@link convexPolygonsIntersect}
 * (each edge normal of `a` and of `b`, normalised so the projected overlap
 * is a real pixel distance), but instead of stopping at the first
 * separating axis, keeps every tested axis's overlap depth and returns the
 * smallest one, oriented to push `a` away from `b`'s {@link centroid}.
 *
 * Unlike a fallback built from a remembered "last known good" position,
 * this only ever looks at `a` and `b`'s *current* shapes, so it can't be
 * confused by that remembered position itself already resting against an
 * obstacle - see `world/collision.ts`'s `resolveSolid`, the reason this
 * exists.
 *
 * @param a - The polygon to find a push-out vector for.
 * @param b - The polygon to separate it from.
 * @returns The MTV to add to every vertex of `a`, or `undefined` if `a` and `b` don't genuinely overlap (including if they're merely touching - zero-depth "overlap" needs no push).
 */
export function minimumTranslationVector(a: ConvexPolygon, b: ConvexPolygon): Vector2d | undefined {
    if (a.length < 2 || b.length < 2) {
        return undefined;
    }

    let smallestOverlap = Infinity;
    let smallestAxisX = 0;
    let smallestAxisY = 0;

    for (const edgePolygon of [a, b]) {
        for (let i = 0; i < edgePolygon.length; i++) {
            const p1 = edgePolygon[i];
            const p2 = edgePolygon[(i + 1) % edgePolygon.length];
            const rawAxisX = -(p2.y - p1.y);
            const rawAxisY = p2.x - p1.x;
            const length = Math.hypot(rawAxisX, rawAxisY);
            if (length === 0) {
                continue; // Degenerate (zero-length) edge - no usable axis.
            }
            const axisX = rawAxisX / length;
            const axisY = rawAxisY / length;

            const [aMin, aMax] = projectOntoAxis(a, axisX, axisY);
            const [bMin, bMax] = projectOntoAxis(b, axisX, axisY);
            if (aMax < bMin || bMax < aMin) {
                return undefined; // A separating axis - not overlapping at all.
            }

            const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
            if (overlap < smallestOverlap) {
                smallestOverlap = overlap;
                smallestAxisX = axisX;
                smallestAxisY = axisY;
            }
        }
    }

    if (!Number.isFinite(smallestOverlap) || smallestOverlap <= 0) {
        return undefined; // Every edge was degenerate, or the shapes only touch (zero depth) - nothing to push out of.
    }

    // The winning axis's sign is arbitrary (whichever edge happened to produce the smallest overlap first) - reorient it to actually point away from b, toward a.
    const centerA = centroid(a);
    const centerB = centroid(b);
    const pointsTowardA = (centerA.x - centerB.x) * smallestAxisX + (centerA.y - centerB.y) * smallestAxisY >= 0;
    const sign = pointsTowardA ? 1 : -1;

    return new Vector2d(smallestAxisX * smallestOverlap * sign, smallestAxisY * smallestOverlap * sign);
}
