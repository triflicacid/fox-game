import { constants } from "./constants.mjs";
import { lerp, distToSegment } from "./geometry.mjs";

const { grid: GRID, center: CENTER } = constants;
const { black: BLACK, cream: CREAM, orange: ORANGE, white: WHITE, rust: RUST } = constants.colors;
const STAND = constants.stand;
const CURL = constants.curl;

// shared shape parameters for the curl-family poses (curl / uncurl / sleepTurn)
export const CURL_POSE = {
    bodyA: CURL.body.a,
    bodyB: CURL.body.b,
    headDist: CURL.head.dist,
    headR: CURL.head.r,
    earBack: CURL.ear.back,
    earSpread: CURL.ear.spread,
    earR: CURL.ear.r,
    snoutDist: CURL.snout.dist,
    snoutR: CURL.snout.r,
    noseDist: CURL.nose.dist,
    noseR: CURL.nose.r,
    // legs tucked away: zero radius, so lerping toward STAND_POSE reads as paws emerging
    legs: [
        { u: 0, v: 0, r: 0 },
        { u: 0, v: 0, r: 0 },
        { u: 0, v: 0, r: 0 },
        { u: 0, v: 0, r: 0 },
    ],
    tailBaseRadius: CURL.tail.arcR,
    tailTipRadius: CURL.tail.arcR,
    tailThickness: CURL.tail.r,
    tipCircleRadius: CURL.tail.tipR,
};

export const STAND_POSE = {
    bodyA: STAND.body.a,
    bodyB: STAND.body.b,
    headDist: STAND.head.dist,
    headR: STAND.head.r,
    earBack: STAND.ear.back,
    earSpread: STAND.ear.spread,
    earR: STAND.ear.r,
    snoutDist: STAND.snout.dist,
    snoutR: STAND.snout.r,
    noseDist: STAND.nose.dist,
    noseR: STAND.nose.r,
    legs: [
        { u: STAND.leg.forward, v: -STAND.leg.side, r: STAND.leg.r },
        { u: STAND.leg.forward, v: STAND.leg.side, r: STAND.leg.r },
        { u: -STAND.leg.forward, v: -STAND.leg.side, r: STAND.leg.r },
        { u: -STAND.leg.forward, v: STAND.leg.side, r: STAND.leg.r },
    ],
    tailBaseRadius: STAND.tail.base,
    tailTipRadius: STAND.tail.tip,
    tailThickness: STAND.tail.r,
    tipCircleRadius: STAND.tail.tipR,
};

/**
 * blends every field of two curl-family poses.
 *
 * @param {object} a - pose at `t = 0` (see `CURL_POSE`/`STAND_POSE` shape).
 * @param {object} b - pose at `t = 1`.
 * @param {number} t - blend factor in `[0, 1]`.
 * @returns {object} the interpolated pose.
 */
export function lerpPose(a, b, t) {
    return {
        bodyA: lerp(a.bodyA, b.bodyA, t),
        bodyB: lerp(a.bodyB, b.bodyB, t),
        headDist: lerp(a.headDist, b.headDist, t),
        headR: lerp(a.headR, b.headR, t),
        earBack: lerp(a.earBack, b.earBack, t),
        earSpread: lerp(a.earSpread, b.earSpread, t),
        earR: lerp(a.earR, b.earR, t),
        snoutDist: lerp(a.snoutDist, b.snoutDist, t),
        snoutR: lerp(a.snoutR, b.snoutR, t),
        noseDist: lerp(a.noseDist, b.noseDist, t),
        noseR: lerp(a.noseR, b.noseR, t),
        legs: a.legs.map((legA, i) => {
            const legB = b.legs[i];
            return { u: lerp(legA.u, legB.u, t), v: lerp(legA.v, legB.v, t), r: lerp(legA.r, legB.r, t) };
        }),
        tailBaseRadius: lerp(a.tailBaseRadius, b.tailBaseRadius, t),
        tailTipRadius: lerp(a.tailTipRadius, b.tailTipRadius, t),
        tailThickness: lerp(a.tailThickness, b.tailThickness, t),
        tipCircleRadius: lerp(a.tipCircleRadius, b.tipCircleRadius, t),
    };
}

/**
 * draws one frame of a curl-family pose (curl / uncurl / sleepTurn).
 *
 * @param {number} facingDeg - facing angle in degrees.
 * @param {number} tailAngleStart - tail base angle in degrees from rear (0 = straight back, 180 = over the nose).
 * @param {number} tailAngleEnd - tail tip angle in degrees from rear, equal to `tailAngleStart` for a straight tail, different for an arc.
 * @param {object} p - pose dimensions, see `CURL_POSE`/`STAND_POSE` shape.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildPoseFrame(facingDeg, tailAngleStart, tailAngleEnd, p) {
    const rad = (facingDeg * Math.PI) / 180;
    const fx = Math.cos(rad), fy = Math.sin(rad);
    const rx = fy, ry = -fx;
    const rearDeg = facingDeg + 180;

    const points = [];
    for (let i = 0; i <= CURL.tail.segments; i++) {
        const t = i / CURL.tail.segments;
        const angle = ((rearDeg + lerp(tailAngleStart, tailAngleEnd, t)) * Math.PI) / 180;
        const r = lerp(p.tailBaseRadius, p.tailTipRadius, t);
        points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    const tip = points[points.length - 1];

    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const px = gx - CENTER;
            const py = gy - CENTER;
            const u = px * fx + py * fy;
            const v = px * rx + py * ry;

            let color = null;

            // priority, topmost first: tail tip wins over the face so it can drape over the nose
            if (Math.hypot(px - tip.x, py - tip.y) <= p.tipCircleRadius) {
                color = WHITE;
            } else if (Math.hypot(u - p.noseDist, v) <= p.noseR) {
                color = BLACK;
            } else if (Math.hypot(u - p.snoutDist, v) <= p.snoutR) {
                color = CREAM;
            } else if (
                Math.hypot(u - (p.headDist - p.earBack), v - p.earSpread) <= p.earR ||
                Math.hypot(u - (p.headDist - p.earBack), v + p.earSpread) <= p.earR
            ) {
                color = BLACK;
            } else if (Math.hypot(u - p.headDist, v) <= p.headR) {
                color = ORANGE;
            } else if ((u / p.bodyA) ** 2 + (v / p.bodyB) ** 2 <= 1) {
                color = ORANGE;
            } else if (p.legs.some(l => l.r > 0 && Math.hypot(u - l.u, v - l.v) <= l.r)) {
                color = BLACK;
            } else {
                for (let i = 0; i < points.length - 1; i++) {
                    const a = points[i], b = points[i + 1];
                    if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= p.tailThickness) {
                        color = RUST;
                        break;
                    }
                }
            }

            grid[gy * GRID + gx] = color;
        }
    }
    return grid;
}
