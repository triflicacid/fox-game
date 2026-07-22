import { colors } from "./poses.mjs";
import { createFrame, getPixel, line, setPixel } from "./raster.mjs";

// 12-phase sinusoidal walk cycle – samples sin/cos at 30° intervals so the
// sequence loops perfectly without a discontinuity at the wrap point.
const STRIDE    = [0,  2,  3,  4,  3,  2,  0, -2, -3, -4, -3, -2];
const BOB       = [0,  1,  1,  0, -1, -1,  0,  1,  1,  0, -1, -1];
// Increased to ±3 so the tail swing is clearly visible after 2× upscale.
// Phase 6 uses +1 rather than 0 so it is pixel-distinct from phase 0
// (both have stride=0 and bob=0; without this the validator would flag a duplicate).
const TAIL_SWAY = [0, -1, -2, -3, -2, -1,  1,  1,  2,  3,  2,  1];

/**
 * Classifies an idle-pose pixel into an independently deformable body region.
 *
 * @param {string} direction - Compass direction of the pose.
 * @param {number} x - Pixel x coordinate within the frame.
 * @param {number} y - Pixel y coordinate within the frame.
 * @returns {"tail"|"left-leg"|"right-leg"|"left-arm"|"right-arm"|"body"} Region identifier.
 */
function region(direction, x, y) {
    // Tail masks deliberately stay away from the body boundary so body pixels
    // drawn on top of the tail root are not misclassified.
    if ((direction === "N" || direction === "S") && x >= 42 && y >= 31) return "tail";
    if ((direction === "NW" || direction === "SE") && x <= 15 && y >= 31) return "tail";
    if ((direction === "NE" || direction === "SW") && x >= 48 && y >= 31) return "tail";
    // Profile root pixels at x=29..34 stay attached beneath the torso; only
    // the visible brush is animated. This also keeps the rear foot out of the
    // tail mask.
    if (direction === "E" && x <= 28 && y >= 38) return "tail";
    if (direction === "W" && x >= 36 && y >= 38) return "tail";
    // Limbs divide around the body centre; everything else moves as the torso.
    if (y >= 43 && x >= 14 && x <= 50) return x < 32 ? "left-leg" : "right-leg";
    if (y >= 27 && y <= 52 && x <= 23) return "left-arm";
    if (y >= 27 && y <= 52 && x >= 41) return "right-arm";
    return "body";
}

/**
 * Measures how far a tail pixel lies from its anchored root.
 *
 * @param {string} direction - Compass direction of the pose.
 * @param {number} x - Tail pixel x coordinate.
 * @returns {number} Normalized root-to-tip progress in the inclusive range 0..1.
 */
function tailProgress(direction, x) {
    if (direction === "N" || direction === "S") return Math.max(0, Math.min(1, (x - 41) / 22));
    if (direction === "NW" || direction === "SE") return Math.max(0, Math.min(1, (15 - x) / 15));
    if (direction === "NE" || direction === "SW") return Math.max(0, Math.min(1, (x - 48) / 15));
    if (direction === "E") return Math.max(0, Math.min(1, (28 - x) / 28));
    return Math.max(0, Math.min(1, (x - 35) / 28));
}

/**
 * Finds all 8-neighbor-connected opaque components in a frame.
 *
 * @param {Buffer} frame - Source RGBA frame.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {number[][][]} Components ordered largest first, each containing `[x, y]` pixels.
 */
function opaqueComponents(frame, width, height) {
    const remaining = new Set();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (getPixel(frame, width, x, y)[3]) remaining.add(`${x},${y}`);
    }
    const result = [];
    while (remaining.size) {
        // Flood-fill one silhouette component before moving to the next seed.
        const first = remaining.values().next().value;
        const queue = [first];
        const component = [];
        remaining.delete(first);
        while (queue.length) {
            const key = queue.pop();
            component.push(key);
            const [x, y] = key.split(",").map(Number);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const neighbor = `${x + dx},${y + dy}`;
                    if (remaining.delete(neighbor)) queue.push(neighbor);
                }
            }
        }
        result.push(component.map((key) => key.split(",").map(Number)));
    }
    return result.sort((a, b) => b.length - a.length);
}

/**
 * Bridges separated animated joints to the main silhouette with outline pixels.
 *
 * Integer deformation can create a one-pixel gap at a wrist, ankle, or tail
 * root. The nearest pair of component pixels is joined until one silhouette
 * remains.
 *
 * @param {Buffer} frame - RGBA frame to repair in place.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {void}
 */
function connectArticulations(frame, width, height) {
    let components = opaqueComponents(frame, width, height);
    while (components.length > 1) {
        let closest;
        // Find the shortest Chebyshev-distance bridge between two components.
        for (const a of components[0]) {
            for (const b of components[1]) {
                const distance = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
                if (!closest || distance < closest.distance) closest = { a, b, distance };
            }
        }
        line(frame, width, height, closest.a, closest.b, colors.outline);
        components = opaqueComponents(frame, width, height);
    }
}

/**
 * Builds one walk phase with anchored hips, shoulders, and tail root.
 *
 * Leg and arm deformation is view-direction-aware:
 *
 * - N/S (front/back): depth stride maps to Y.  A short ramp `(y-43)/8` reaches
 *   full displacement at the upper thigh and holds it there for the rest of the
 *   leg.  This eliminates the stretch-and-split artifact that occurs when the
 *   hip barely moves but the foot moves 3× as far.
 * - E/W (profile): the full progressive factor is kept – it reads naturally as a
 *   swinging leg when seen from the side.
 * - Diagonals: weighted mix of both axes with the same short ramp for Y.
 *
 * The tail swings laterally (X axis) in N/S view and bobs vertically (Y axis) in
 * E/W view, with root-to-tip progress so the tip swings more than the root.
 *
 * @param {Buffer} idle - Directional idle pose used as the deformation source.
 * @param {string} direction - Compass direction of the pose.
 * @param {number} phase - Zero-based walk phase in the range 0..11.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {Buffer} A new connected RGBA walking frame.
 */
export function buildWalkFrame(idle, direction, phase, width, height) {
    const result = createFrame(width, height);
    const stride = STRIDE[phase];
    const bob = BOB[phase];
    const isFrontBack = direction === "N" || direction === "S";
    const isSide = direction === "E" || direction === "W";
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = getPixel(idle, width, x, y);
            if (!color[3]) continue;
            const part = region(direction, x, y);
            let dx = 0;
            let dy = bob;
            if (part === "left-leg" || part === "right-leg") {
                const sign = part === "left-leg" ? 1 : -1;
                if (isFrontBack) {
                    // Short ramp: 0 at hip (y=43) → full at upper thigh (y=51).
                    // Every pixel at y≥51 moves the same amount, so the leg
                    // translates as a unit and cannot stretch-split at the ankle.
                    const depthP = Math.max(0, Math.min(1, (y - 43) / 8));
                    dy += Math.round(sign * stride * 0.45 * depthP);
                } else if (isSide) {
                    // Full progressive factor looks natural as a swinging leg.
                    const progress = Math.max(0, Math.min(1, (y - 42) / 25));
                    dx += Math.round(sign * stride * 0.75 * progress);
                } else {
                    const progress = Math.max(0, Math.min(1, (y - 42) / 25));
                    const depthP = Math.max(0, Math.min(1, (y - 43) / 8));
                    dx += Math.round(sign * stride * 0.5 * progress);
                    dy += Math.round(sign * stride * 0.3 * depthP);
                }
            } else if (part === "left-arm" || part === "right-arm") {
                // Arms counter-swing against their corresponding legs.
                const sign = part === "left-arm" ? -1 : 1;
                if (isFrontBack) {
                    // Flat arm displacement avoids the same stretch problem.
                    dy += Math.round(sign * stride * 0.3);
                } else if (isSide) {
                    const progress = Math.max(0, Math.min(1, (y - 27) / 24));
                    dx += Math.round(sign * stride * 0.55 * progress);
                } else {
                    const progress = Math.max(0, Math.min(1, (y - 27) / 24));
                    dx += Math.round(sign * stride * 0.35 * progress);
                    dy += Math.round(sign * stride * 0.2);
                }
            } else if (part === "tail") {
                // Tail sway grows from zero at the root to full motion at the tip.
                const progress = tailProgress(direction, x);
                if (isFrontBack) {
                    // Front/back: tail swings left/right as the hips counter-rotate.
                    dx += Math.round(TAIL_SWAY[phase] * progress);
                } else if (isSide) {
                    // Profile: tail bobs vertically.
                    dy += Math.round(TAIL_SWAY[phase] * progress);
                } else {
                    // Diagonal: blend lateral swing with a gentler vertical bob.
                    dx += Math.round(TAIL_SWAY[phase] * progress * 0.7);
                    dy += Math.round(TAIL_SWAY[phase] * progress * 0.4);
                }
            }
            setPixel(result, width, height, x + dx, y + dy, color);
        }
    }
    // Fill enclosed pinholes produced by integer joint deformation.
    const filled = Buffer.from(result);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (getPixel(result, width, x, y)[3]) continue;
            const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([nx,ny]) => getPixel(result,width,nx,ny)).filter((pixel) => pixel[3]);
            if (neighbors.length >= 3) setPixel(filled, width, height, x, y, neighbors[0]);
        }
    }
    connectArticulations(filled, width, height);
    return filled;
}
