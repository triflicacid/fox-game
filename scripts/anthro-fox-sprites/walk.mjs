import { colors } from "./poses.mjs";
import { createFrame, getPixel, line, setPixel } from "./raster.mjs";

const STRIDE = [3, 2, 0, -2, -3, -2, 0, 2];
const BOB = [0, 1, 1, 0, -1, 0, 1, 0];
const TAIL_SWAY = [0, -2, -2, 0, 2, 2, 0, -1];

/**
 * Classifies an idle-pose pixel into an independently deformable body region.
 *
 * @param {string} direction - Compass direction of the pose.
 * @param {number} x - Pixel x coordinate within the frame.
 * @param {number} y - Pixel y coordinate within the frame.
 * @returns {"tail"|"left-leg"|"right-leg"|"left-arm"|"right-arm"|"body"} Region identifier.
 */
function region(direction, x, y) {
    // Tail masks differ by view because the brush sits behind a different hip.
    if ((direction === "N" || direction === "S") && x >= 42 && y >= 34) return "tail";
    if ((direction === "NE" || direction === "SE") && x <= 15 && y >= 34) return "tail";
    if ((direction === "NW" || direction === "SW") && x >= 48 && y >= 34) return "tail";
    if (direction === "E" && x <= 28 && y >= 34) return "tail";
    if (direction === "W" && x >= 35 && y >= 34) return "tail";
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
    if (direction === "N" || direction === "S") return Math.max(0, Math.min(1, (x - 42) / 20));
    if (direction === "NE" || direction === "SE") return Math.max(0, Math.min(1, (15 - x) / 14));
    if (direction === "NW" || direction === "SW") return Math.max(0, Math.min(1, (x - 48) / 14));
    if (direction === "E") return Math.max(0, Math.min(1, (28 - x) / 27));
    return Math.max(0, Math.min(1, (x - 35) / 27));
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
 * @param {Buffer} idle - Directional idle pose used as the deformation source.
 * @param {string} direction - Compass direction of the pose.
 * @param {number} phase - Zero-based walk phase in the range 0..7.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {Buffer} A new connected RGBA walking frame.
 */
export function buildWalkFrame(idle, direction, phase, width, height) {
    const result = createFrame(width, height);
    const stride = STRIDE[phase];
    const bob = BOB[phase];
    const strideScale = direction === "N" || direction === "S" ? 0.67 : 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = getPixel(idle, width, x, y);
            if (!color[3]) continue;
            const part = region(direction, x, y);
            let dx = 0;
            let dy = bob;
            if (part === "left-leg" || part === "right-leg") {
                // Displacement grows from the fixed hip toward the moving paw.
                const progress = Math.max(0, Math.min(1, (y - 42) / 25));
                const sign = part === "left-leg" ? 1 : -1;
                dx += Math.round(sign * stride * strideScale * progress);
                dy += Math.round((sign * stride < 0 ? 1 : 0) * progress);
            } else if (part === "left-arm" || part === "right-arm") {
                // Arms counter-swing against their corresponding legs.
                const progress = Math.max(0, Math.min(1, (y - 27) / 24));
                const sign = part === "left-arm" ? -1 : 1;
                dx += Math.round(sign * stride * 0.55 * progress);
            } else if (part === "tail") {
                // Tail sway grows from zero at the root to full motion at the tip.
                dy += Math.round(TAIL_SWAY[phase] * tailProgress(direction, x));
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
