import { constants } from "./constants.mjs";
import { distToSegment, lerp } from "./geometry.mjs";

const { grid: GRID, center: CENTER, phases: PHASES } = constants;
const { black: BLACK, cream: CREAM, orange: ORANGE, white: WHITE, rust: RUST } = constants.colors;
const { vectors: DIRS } = constants.dirs;
const { a: STRIDE_A, b: STRIDE_B, sway: SWAY } = constants.stride;
const SWIM = constants.swim;

const DEG = Math.PI / 180;

/**
 * places the two front paws for a phase, in local (u = forward, v = right)
 * space. Each sweeps fore/aft on the shared stride wave, splaying out on the
 * forward reach and tucking in as it pulls back.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {{side: number, u: number, v: number, entryAge: number}[]} the left paw then the right.
 */
function buildPaws(phase) {
    return [-1, 1].map((side) => {
        const left = side < 0;
        const stroke = (left ? STRIDE_A : STRIDE_B)[phase];
        const entry = left ? SWIM.splash.entry.a : SWIM.splash.entry.b;
        return {
            side,
            u: SWIM.paw.forward + stroke * SWIM.paw.reach,
            v: side * (SWIM.paw.side + stroke * SWIM.paw.splay),
            entryAge: (phase / PHASES - entry + 1) % 1, // cycle time since this paw hit the water
        };
    });
}

/**
 * stamps the splash droplets both paws are throwing this phase into a drawn
 * frame: a paw's water entry fans white dots outward and back, shrinking as
 * they travel. The paws enter half a cycle apart, so the spray alternates side
 * to side. Droplets are snapped to whole cells - a rotated sub-cell circle
 * rasterises into ragged fragments that read as debris rather than spray.
 *
 * @param {(number[]|null)[]} grid - frame to stamp into, modified in place.
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @param {{fx: number, fy: number, rx: number, ry: number}} dir - the direction's forward/right unit vectors.
 * @returns {void}
 */
function stampSplash(grid, phase, { fx, fy, rx, ry }) {
    for (const paw of buildPaws(phase)) {
        const travelled = lerp(SWIM.splash.drift.near, SWIM.splash.drift.far, paw.entryAge);
        const spray = paw.side * (90 + SWIM.splash.backTilt) * DEG; // straight out, leaning back
        for (const droplet of SWIM.splash.droplets) {
            const life = droplet.size * (1 - paw.entryAge);
            const size = life >= SWIM.splash.cells.double ? 2 : life >= SWIM.splash.cells.single ? 1 : 0;
            if (size === 0) continue;

            const angle = spray + paw.side * droplet.deg * DEG;
            const dist = travelled * droplet.drift;
            const u = paw.u + dist * Math.cos(angle);
            const v = paw.v + dist * Math.sin(angle);
            const originX = Math.round(u * fx + v * rx + CENTER);
            const originY = Math.round(u * fy + v * ry + CENTER);

            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    const gx = originX + dx, gy = originY + dy;
                    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
                    grid[gy * GRID + gx] = WHITE;
                }
            }
        }
    }
}

/**
 * draws one frame of the swim cycle for a compass direction: a low, bobbing
 * body with the front paws paddling in alternation and a submerged tail
 * trailing behind, spraying white splash droplets on each paw's water entry.
 *
 * @param {string} dirName - direction name, one of `DIR_ORDER`.
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @param {boolean} [withSplash] - false to draw the fox alone, for measuring collision bounds the spray shouldn't inflate.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildSwimFrame(dirName, phase, withSplash = true) {
    const { fx, fy, rx, ry } = DIRS[dirName];

    const bob = Math.sin((4 * Math.PI * phase) / PHASES); // two bobs per paddle cycle, one per stroke
    const bodyA = SWIM.body.a * (1 + bob * SWIM.bob.body);
    const bodyB = SWIM.body.b * (1 + bob * SWIM.bob.body);
    const headDist = SWIM.head.dist + bob * SWIM.bob.head;
    // snout/nose keep their fixed offset past the head, riding the bob with it
    const snoutDist = headDist + (SWIM.snout.dist - SWIM.head.dist);
    const noseDist = headDist + (SWIM.nose.dist - SWIM.head.dist);

    const paws = buildPaws(phase);
    const tailBase = { u: -SWIM.tail.base, v: 0 };
    const tailTip = { u: -SWIM.tail.tip, v: SWAY[phase] * SWIM.tail.sway };

    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const px = gx - CENTER;
            const py = gy - CENTER;
            const u = px * fx + py * fy;
            const v = px * rx + py * ry;

            let color = null;

            // priority, topmost first
            if (Math.hypot(u - noseDist, v) <= SWIM.nose.r) {
                color = BLACK;
            } else if (Math.hypot(u - snoutDist, v) <= SWIM.snout.r) {
                color = CREAM;
            } else if (
                Math.hypot(u - (headDist - SWIM.ear.back), v - SWIM.ear.spread) <= SWIM.ear.r ||
                Math.hypot(u - (headDist - SWIM.ear.back), v + SWIM.ear.spread) <= SWIM.ear.r
            ) {
                color = BLACK;
            } else if (Math.hypot(u - headDist, v) <= SWIM.head.r) {
                color = ORANGE;
            } else if ((u / bodyA) ** 2 + (v / bodyB) ** 2 <= 1) {
                color = ORANGE;
            } else if (paws.some(p => Math.hypot(u - p.u, v - p.v) <= SWIM.paw.r)) {
                color = BLACK;
            } else if (Math.hypot(u - tailTip.u, v - tailTip.v) <= SWIM.tail.tipR) {
                color = WHITE;
            } else if (distToSegment(u, v, tailBase.u, tailBase.v, tailTip.u, tailTip.v) <= SWIM.tail.r) {
                color = RUST; // waterlogged, so darker than the standing tail
            }

            grid[gy * GRID + gx] = color;
        }
    }

    if (withSplash) stampSplash(grid, phase, DIRS[dirName]);
    return grid;
}
