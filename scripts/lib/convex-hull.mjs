/**
 * signed area (doubled) of the turn `o -> a -> b` - positive for a
 * counter-clockwise turn in a standard (y-up) axis sense.
 *
 * @param {{x: number, y: number}} o - turn's origin point.
 * @param {{x: number, y: number}} a - turn's first leg endpoint.
 * @param {{x: number, y: number}} b - turn's second leg endpoint.
 * @returns {number} the cross product `(a - o) x (b - o)`.
 */
export function crossProduct(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * computes the convex hull of a point set (Andrew's monotone chain) - shared
 * by gen-cactus-sprites.mjs and gen-structure-sprites.mjs, which both hull a
 * blob's sampled circumference points into a tight collision polygon.
 *
 * @param {{x: number, y: number}[]} points - input points, not required to be sorted or de-duplicated.
 * @returns {{x: number, y: number}[]} the hull's vertices.
 */
export function convexHull(points) {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}
