/**
 * Creates a transparent row-major RGBA pixel buffer.
 *
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {Buffer} A zero-filled RGBA buffer sized for the frame.
 */
export function createFrame(width, height) {
    return Buffer.alloc(width * height * 4, 0);
}

/**
 * Writes one pixel when its coordinates fall inside the frame.
 *
 * @param {Buffer} frame - Destination RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @param {number} x - Horizontal pixel coordinate.
 * @param {number} y - Vertical pixel coordinate.
 * @param {number[]} color - Four-channel RGBA color.
 * @returns {void}
 */
export function setPixel(frame, width, height, x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    frame.set(color, i);
}

/**
 * Reads one RGBA pixel from a frame.
 *
 * @param {Buffer} frame - Source RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} x - Horizontal pixel coordinate.
 * @param {number} y - Vertical pixel coordinate.
 * @returns {number[]} The pixel's four RGBA channels.
 */
export function getPixel(frame, width, x, y) {
    const i = (y * width + x) * 4;
    return [frame[i], frame[i + 1], frame[i + 2], frame[i + 3]];
}

/**
 * Fills an inclusive axis-aligned rectangle.
 *
 * @param {Buffer} frame - Destination RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @param {number} x0 - Left edge, inclusive.
 * @param {number} y0 - Top edge, inclusive.
 * @param {number} x1 - Right edge, inclusive.
 * @param {number} y1 - Bottom edge, inclusive.
 * @param {number[]} color - Fill RGBA color.
 * @returns {void}
 */
export function rectangle(frame, width, height, x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) setPixel(frame, width, height, x, y, color);
    }
}

/**
 * Draws a one-pixel-wide Bresenham line, including both endpoints.
 *
 * @param {Buffer} frame - Destination RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @param {number[]} from - Starting `[x, y]` coordinate.
 * @param {number[]} to - Ending `[x, y]` coordinate.
 * @param {number[]} color - Line RGBA color.
 * @returns {void}
 */
export function line(frame, width, height, from, to, color) {
    let [x0, y0] = from;
    const [x1, y1] = to;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
        setPixel(frame, width, height, x0, y0, color);
        if (x0 === x1 && y0 === y1) break;
        const twiceError = 2 * error;
        if (twiceError >= dy) { error += dy; x0 += sx; }
        if (twiceError <= dx) { error += dx; y0 += sy; }
    }
}

/**
 * Scan-converts and fills a closed polygon, then redraws its boundary.
 *
 * @param {Buffer} frame - Destination RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @param {number[][]} points - Ordered polygon vertices as `[x, y]` pairs.
 * @param {number[]} color - Fill RGBA color.
 * @returns {void}
 */
export function polygon(frame, width, height, points, color) {
    const minY = Math.max(0, Math.min(...points.map(([, y]) => y)));
    const maxY = Math.min(height - 1, Math.max(...points.map(([, y]) => y)));
    for (let y = minY; y <= maxY; y++) {
        const intersections = [];
        for (let i = 0; i < points.length; i++) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[(i + 1) % points.length];
            if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
                intersections.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
            }
        }
        // Pair scanline intersections to fill every interior horizontal span.
        intersections.sort((a, b) => a - b);
        for (let i = 0; i + 1 < intersections.length; i += 2) {
            const start = Math.ceil(intersections[i]);
            const end = Math.floor(intersections[i + 1]);
            for (let x = start; x <= end; x++) setPixel(frame, width, height, x, y, color);
        }
    }
    // Explicit edges keep steep and horizontal boundaries pixel-contiguous.
    for (let i = 0; i < points.length; i++) line(frame, width, height, points[i], points[(i + 1) % points.length], color);
}

/**
 * Mirrors a frame horizontally without filtering or palette changes.
 *
 * @param {Buffer} frame - Source RGBA buffer.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {Buffer} A new horizontally mirrored frame.
 */
export function mirror(frame, width, height) {
    const result = createFrame(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) setPixel(result, width, height, width - 1 - x, y, getPixel(frame, width, x, y));
    }
    return result;
}

/**
 * Scales an RGBA pixel buffer up 2× using nearest-neighbor interpolation,
 * replicating each pixel into a 2×2 block.
 *
 * @param {Buffer} buffer - Source RGBA pixel buffer.
 * @param {number} width - Source width in pixels.
 * @param {number} height - Source height in pixels.
 * @returns {Buffer} A new RGBA buffer at twice the source dimensions.
 */
export function scale2x(buffer, width, height) {
    const scaledW = width * 2;
    const scaledH = height * 2;
    const result = Buffer.alloc(scaledW * scaledH * 4, 0);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const r = buffer[srcIdx];
            const g = buffer[srcIdx + 1];
            const b = buffer[srcIdx + 2];
            const a = buffer[srcIdx + 3];
            if (!a) continue;
            // Write four output pixels for each source pixel.
            for (let oy = 0; oy < 2; oy++) {
                for (let ox = 0; ox < 2; ox++) {
                    const dstIdx = ((y * 2 + oy) * scaledW + (x * 2 + ox)) * 4;
                    result[dstIdx] = r;
                    result[dstIdx + 1] = g;
                    result[dstIdx + 2] = b;
                    result[dstIdx + 3] = a;
                }
            }
        }
    }
    return result;
}

/**
 * Alpha-blits opaque source pixels into a larger destination buffer.
 *
 * @param {Buffer} source - Source RGBA frame.
 * @param {number} sourceWidth - Source width in pixels.
 * @param {number} sourceHeight - Source height in pixels.
 * @param {Buffer} target - Destination RGBA buffer.
 * @param {number} targetWidth - Destination width in pixels.
 * @param {number} x0 - Destination x origin.
 * @param {number} y0 - Destination y origin.
 * @returns {void}
 */
export function blit(source, sourceWidth, sourceHeight, target, targetWidth, x0, y0) {
    for (let y = 0; y < sourceHeight; y++) {
        for (let x = 0; x < sourceWidth; x++) {
            const color = getPixel(source, sourceWidth, x, y);
            if (color[3]) setPixel(target, targetWidth, Math.floor(target.length / 4 / targetWidth), x0 + x, y0 + y, color);
        }
    }
}
