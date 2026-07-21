import { constants } from "./constants.mjs";
import { distToSegment } from "./geometry.mjs";

const { grid: GRID, center: CENTER } = constants;
const { black: BLACK, cream: CREAM, orange: ORANGE, white: WHITE } = constants.colors;
const { vectors: DIRS } = constants.dirs;
const { a: STRIDE_A, b: STRIDE_B, sway: SWAY } = constants.stride;
const STAND = constants.stand;

/**
 * draws one frame of the walk cycle for a compass direction.
 *
 * @param {string} dirName - direction name, one of `DIR_ORDER`.
 * @param {number} phase - walk cycle phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildFrame(dirName, phase) {
    const { fx, fy, rx, ry } = DIRS[dirName];
    const sA = STRIDE_A[phase] * STAND.leg.stride;
    const sB = STRIDE_B[phase] * STAND.leg.stride;
    const sway = SWAY[phase] * STAND.tail.sway;

    // leg centers in (u, v) local space: u = forward, v = right.
    // diagonal trot pairs share the same stride offset so they swing together
    const legs = [
        { u: STAND.leg.forward + sA, v: -STAND.leg.side },  // front-left  (pair a)
        { u: STAND.leg.forward + sB, v: STAND.leg.side },   // front-right (pair b)
        { u: -STAND.leg.forward + sB, v: -STAND.leg.side }, // back-left   (pair b)
        { u: -STAND.leg.forward + sA, v: STAND.leg.side },  // back-right  (pair a)
    ];

    const tailBase = { u: -STAND.tail.base, v: 0 };
    const tailTip = { u: -STAND.tail.tip, v: sway };

    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const px = gx - CENTER;
            const py = gy - CENTER;
            const u = px * fx + py * fy;
            const v = px * rx + py * ry;

            let color = null;

            // priority, topmost first
            if (Math.hypot(u - STAND.nose.dist, v) <= STAND.nose.r) {
                color = BLACK;
            } else if (Math.hypot(u - STAND.snout.dist, v) <= STAND.snout.r) {
                color = CREAM;
            } else if (
                Math.hypot(u - (STAND.head.dist - STAND.ear.back), v - STAND.ear.spread) <= STAND.ear.r ||
                Math.hypot(u - (STAND.head.dist - STAND.ear.back), v + STAND.ear.spread) <= STAND.ear.r
            ) {
                color = BLACK;
            } else if (Math.hypot(u - STAND.head.dist, v) <= STAND.head.r) {
                color = ORANGE;
            } else if ((u / STAND.body.a) ** 2 + (v / STAND.body.b) ** 2 <= 1) {
                color = ORANGE;
            } else if (legs.some(l => Math.hypot(u - l.u, v - l.v) <= STAND.leg.r)) {
                color = BLACK;
            } else if (Math.hypot(u - tailTip.u, v - tailTip.v) <= STAND.tail.tipR) {
                color = WHITE;
            } else if (distToSegment(u, v, tailBase.u, tailBase.v, tailTip.u, tailTip.v) <= STAND.tail.r) {
                color = ORANGE;
            }

            grid[gy * GRID + gx] = color;
        }
    }
    return grid;
}
