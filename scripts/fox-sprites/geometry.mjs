import { constants } from "./constants.mjs";

const { grid: GRID, block: BLOCK, cellPx: CELL_PX } = constants;

/**
 * linearly interpolates between two numbers.
 *
 * @param {number} a - start value.
 * @param {number} b - end value.
 * @param {number} t - blend factor, typically in `[0, 1]`.
 * @returns {number} the interpolated value.
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * finds the shortest distance from a point to a line segment.
 *
 * @param {number} px - point x.
 * @param {number} py - point y.
 * @param {number} ax - segment start x.
 * @param {number} ay - segment start y.
 * @param {number} bx - segment end x.
 * @param {number} by - segment end y.
 * @returns {number} the distance from the point to the nearest point on the segment.
 */
export function distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const abLen2 = abx * abx + aby * aby;
    let t = abLen2 > 0 ? (apx * abx + apy * aby) / abLen2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t, cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}

/**
 * computes the z component of the cross product of `o->a` and `o->b`.
 *
 * @param {{x: number, y: number}} o - common origin point.
 * @param {{x: number, y: number}} a - first point.
 * @param {{x: number, y: number}} b - second point.
 * @returns {number} positive if `o->a->b` turns left, negative if it turns right, zero if collinear.
 */
export function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * computes the convex hull of a set of points using the monotone chain algorithm.
 *
 * @param {{x: number, y: number}[]} points - input points, in sheet pixel space (y increases downward).
 * @returns {{x: number, y: number}[]} the hull vertices, without a repeated start/end point.
 */
export function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/**
 * collects the pixel-space corners of every opaque cell in a frame's color grid.
 *
 * @param {(number[]|null)[]} gridColors - row-major grid of rgba colors for one frame.
 * @param {{x: number, y: number}[]} points - array to append the corner points to.
 * @returns {void}
 */
export function collectOpaquePoints(gridColors, points) {
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            if (!gridColors[gy * GRID + gx]) continue;
            points.push({ x: gx * BLOCK, y: gy * BLOCK });
            points.push({ x: (gx + 1) * BLOCK, y: gy * BLOCK });
            points.push({ x: gx * BLOCK, y: (gy + 1) * BLOCK });
            points.push({ x: (gx + 1) * BLOCK, y: (gy + 1) * BLOCK });
        }
    }
}

/**
 * converts hull points relative to a cell's top-left corner into points relative to its center.
 *
 * @param {{x: number, y: number}[]} hullPoints - hull vertices, relative to the cell's top-left.
 * @returns {{points: {x: number, y: number}[]}} the bounds shape, matching `SpriteBounds` in src/sprites/sprite.d.ts.
 */
export function hullToBounds(hullPoints) {
    const half = CELL_PX / 2;
    return { points: hullPoints.map((p) => ({ x: p.x - half, y: p.y - half })) };
}
