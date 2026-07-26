import { constants } from "./constants.mjs";
import { lerp, projectOnSegment } from "./geometry.mjs";

const { black: BLACK, cream: CREAM, orange: ORANGE } = constants.colors;
const { vectors: DIRS, order: DIR_ORDER } = constants.dirs;
const STAND = constants.stand;
const LEAP = constants.leap;
const DASH = constants.dash;

// generous square canvas used only to measure the pose's local (u, v) reach
// (see measureLocalExtents); comfortably larger than anything the pose draws
const PROBE_SIZE = 64;

/**
 * blends two rgba colors.
 *
 * @param {number[]} a - color at `t = 0`.
 * @param {number[]} b - color at `t = 1`.
 * @param {number} t - blend factor in `[0, 1]`.
 * @returns {number[]} the interpolated rgba color, each channel rounded to an integer.
 */
function lerpColor(a, b, t) {
    return a.map((channel, i) => Math.round(lerp(channel, b[i], t)));
}

/**
 * draws one frame of the leap pose onto a `gridW`x`gridH` canvas, given the
 * forward/right unit vectors for whichever direction it should face. The
 * pose itself (body stretch, tucked/reaching legs, streaming tail) is
 * identical for every direction - only this rotation, and the canvas size
 * a direction needs to fit it without clipping, differ.
 *
 * @param {number} fx - forward vector x component.
 * @param {number} fy - forward vector y component.
 * @param {number} rx - right vector x component.
 * @param {number} ry - right vector y component.
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @param {number} gridW - canvas width, in grid units.
 * @param {number} gridH - canvas height, in grid units.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
function drawLeapPose(fx, fy, rx, ry, phase, gridW, gridH) {
    const centerX = (gridW - 1) / 2;
    const centerY = (gridH - 1) / 2;

    const t = LEAP.stretchT[phase];
    const bodyA = lerp(STAND.body.a, LEAP.stretch.body.a, t);
    const bodyB = lerp(STAND.body.b, LEAP.stretch.body.b, t);
    const headDist = lerp(STAND.head.dist, LEAP.stretch.head.dist, t);
    const headR = lerp(STAND.head.r, LEAP.stretch.head.r, t);
    const earBack = lerp(STAND.ear.back, LEAP.stretch.ear.back, t);
    const earSpread = lerp(STAND.ear.spread, LEAP.stretch.ear.spread, t);
    const earR = lerp(STAND.ear.r, LEAP.stretch.ear.r, t);
    // snout/nose keep their fixed offset past the head and radius, tracking headDist as it grows
    const snoutDist = headDist + (STAND.snout.dist - STAND.head.dist);
    const noseDist = headDist + (STAND.nose.dist - STAND.head.dist);
    const tailBaseDist = lerp(STAND.tail.base, LEAP.stretch.tail.base, t);
    const tailTipDist = lerp(STAND.tail.tip, LEAP.stretch.tail.tip, t);
    const tailR = lerp(STAND.tail.r, LEAP.stretch.tail.r, t);
    const tailTipR = lerp(STAND.tail.tipR, LEAP.stretch.tail.tipR, t);

    const legs = LEAP.legs[phase];
    const tailBase = { u: -tailBaseDist, v: 0 };
    const tailTip = { u: -tailTipDist, v: 0 }; // streams straight back, no sway

    const grid = new Array(gridW * gridH);

    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            const px = gx - centerX;
            const py = gy - centerY;
            const u = px * fx + py * fy;
            const v = px * rx + py * ry;

            let color = null;

            // priority, topmost first
            if (Math.hypot(u - noseDist, v) <= STAND.nose.r) {
                color = BLACK;
            } else if (Math.hypot(u - snoutDist, v) <= STAND.snout.r) {
                color = CREAM;
            } else if (
                Math.hypot(u - (headDist - earBack), v - earSpread) <= earR ||
                Math.hypot(u - (headDist - earBack), v + earSpread) <= earR
            ) {
                color = BLACK;
            } else if (Math.hypot(u - headDist, v) <= headR) {
                color = ORANGE;
            } else if ((u / bodyA) ** 2 + (v / bodyB) ** 2 <= 1) {
                color = ORANGE;
            } else if (legs.some(l => l.r > 0 && Math.hypot(u - l.u, v - l.v) <= l.r)) {
                color = BLACK;
            } else if (Math.hypot(u - tailTip.u, v - tailTip.v) <= tailTipR) {
                color = DASH.accentColor;
            } else {
                const { t: alongTail, dist } = projectOnSegment(u, v, tailBase.u, tailBase.v, tailTip.u, tailTip.v);
                if (dist <= tailR) {
                    if (!DASH.addColourFade) {
                        color = ORANGE;
                    } else {
                        const fadeT = Math.max(0, (alongTail - DASH.tailFadeStart) / (1 - DASH.tailFadeStart));
                        color = fadeT > 0 ? lerpColor(ORANGE, DASH.accentColor, fadeT) : ORANGE;
                    }
                }
            }

            grid[gy * gridW + gx] = color;
        }
    }
    return grid;
}

/**
 * measures how far the leap pose's opaque pixels reach from centre, in its
 * own local (u = forward, v = right) coordinates, across every phase. Drawn
 * axis-aligned (fx=1, fy=0) on a generous square probe canvas so the raw
 * pixel offsets already are the local u/v reach, with no rotation to undo.
 *
 * @returns {{uMaxFront: number, uMaxBack: number, vMax: number}} the pose's local reach, padded by `LEAP.extentPadding`.
 */
function measureLocalExtents() {
    let uMaxFront = 0, uMaxBack = 0, vMax = 0;
    const center = (PROBE_SIZE - 1) / 2;

    for (let phase = 0; phase < constants.phases; phase++) {
        const grid = drawLeapPose(1, 0, 0, -1, phase, PROBE_SIZE, PROBE_SIZE);
        for (let gy = 0; gy < PROBE_SIZE; gy++) {
            for (let gx = 0; gx < PROBE_SIZE; gx++) {
                if (!grid[gy * PROBE_SIZE + gx]) continue;
                const u = gx - center;
                const v = -(gy - center);
                uMaxFront = Math.max(uMaxFront, u);
                uMaxBack = Math.max(uMaxBack, -u);
                vMax = Math.max(vMax, Math.abs(v));
            }
        }
    }

    return {
        uMaxFront: uMaxFront + LEAP.extentPadding,
        uMaxBack: uMaxBack + LEAP.extentPadding,
        vMax: vMax + LEAP.extentPadding,
    };
}

const LOCAL_EXTENTS = measureLocalExtents();

/**
 * computes the smallest axis-aligned canvas (in grid units) that fits the
 * leap pose's measured local extents once rotated to face `dirName` - a
 * cardinal dash (long along one screen axis, narrow across it) needs a very
 * different canvas than a diagonal one (reach spread evenly across both).
 *
 * @param {string} dirName - direction name, one of `DIR_ORDER`.
 * @returns {{gridW: number, gridH: number}} the canvas size, in grid units.
 */
function computeCanvasSize(dirName) {
    const { fx, fy, rx, ry } = DIRS[dirName];
    const { uMaxFront, uMaxBack, vMax } = LOCAL_EXTENTS;

    let pxHalf = 0, pyHalf = 0;
    for (const u of [-uMaxBack, uMaxFront]) {
        for (const v of [-vMax, vMax]) {
            pxHalf = Math.max(pxHalf, Math.abs(fx * u + rx * v));
            pyHalf = Math.max(pyHalf, Math.abs(fy * u + ry * v));
        }
    }

    // *2 mirrors the half-extent to both sides of centre; +2 keeps the
    // centre comfortably past it rather than flush on the boundary
    return {
        gridW: 2 * Math.ceil(pxHalf) + 2,
        gridH: 2 * Math.ceil(pyHalf) + 2,
    };
}

const CANVAS_SIZE = new Map(DIR_ORDER.map((dirName) => [dirName, computeCanvasSize(dirName)]));

/**
 * the grid-unit canvas size a direction's dash row needs.
 *
 * @param {string} dirName - direction name, one of `DIR_ORDER`.
 * @returns {{gridW: number, gridH: number}} the canvas size, in grid units.
 */
export function getLeapCanvasSize(dirName) {
    return CANVAS_SIZE.get(dirName);
}

/**
 * draws one frame of the leap (dash) animation for a compass direction: the
 * body stretches and the tail streams straight behind through launch and the
 * airborne hold, then eases back toward standing proportions on landing.
 * Legs push off at launch, tuck away mid-air, then reappear front-first on
 * landing. Canvas size is `getLeapCanvasSize(dirName)`, tailored so this
 * direction's frames don't clip.
 *
 * @param {string} dirName - direction name, one of `DIR_ORDER`.
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildLeapFrame(dirName, phase) {
    const { fx, fy, rx, ry } = DIRS[dirName];
    const { gridW, gridH } = getLeapCanvasSize(dirName);
    return drawLeapPose(fx, fy, rx, ry, phase, gridW, gridH);
}
