import { createHash } from "node:crypto";
import { DIRECTIONS, colors } from "./anthro-fox-sprites/poses.mjs";
import { buildSheet, FRAME_INTERVAL_MS, PHASES } from "./anthro-fox-sprites/sheet.mjs";

/**
 * Throws a validation error when a required invariant is false.
 *
 * @param {unknown} condition - Value expected to be truthy.
 * @param {string} message - Failure description.
 * @returns {void}
 */
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

/**
 * Extracts one cell from the generated sheet into a standalone RGBA buffer.
 *
 * @param {Buffer} sheet - Full sprite-sheet RGBA buffer.
 * @param {number} sheetWidth - Full sheet width in pixels.
 * @param {number} cellWidth - Cell width in pixels.
 * @param {number} cellHeight - Cell height in pixels.
 * @param {number} column - Zero-based sheet column.
 * @param {number} row - Zero-based sheet row.
 * @returns {Buffer} Extracted cell pixels.
 */
function framePixels(sheet, sheetWidth, cellWidth, cellHeight, column, row) {
    const frame = Buffer.alloc(cellWidth * cellHeight * 4);
    for (let y = 0; y < cellHeight; y++) {
        const start = ((row * cellHeight + y) * sheetWidth + column * cellWidth) * 4;
        sheet.copy(frame, y * cellWidth * 4, start, start + cellWidth * 4);
    }
    return frame;
}

/**
 * Collects the coordinates of every opaque pixel in a frame.
 *
 * @param {Buffer} frame - Source RGBA frame.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @returns {Set<string>} Coordinate keys in `x,y` form.
 */
function opaqueKeys(frame, width, height) {
    const keys = new Set();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (frame[(y * width + x) * 4 + 3]) keys.add(`${x},${y}`);
    }
    return keys;
}

/**
 * Verifies that a frame has one connected, non-empty, padded silhouette.
 *
 * @param {Buffer} frame - Source RGBA frame.
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @param {string} label - Human-readable frame identifier for errors.
 * @returns {void}
 */
function assertConnected(frame, width, height, label) {
    const opaque = opaqueKeys(frame, width, height);
    assert(opaque.size > 0, `${label} is empty`);
    const remaining = new Set(opaque);
    const queue = [remaining.values().next().value];
    remaining.delete(queue[0]);
    // Flood-fill with 8-neighbor connectivity, matching pixel-art diagonals.
    while (queue.length) {
        const [x, y] = queue.pop().split(",").map(Number);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = `${x + dx},${y + dy}`;
                if (remaining.delete(key)) queue.push(key);
            }
        }
    }
    assert(remaining.size === 0, `${label} has ${remaining.size} disconnected pixels`);
    const points = [...opaque].map((key) => key.split(",").map(Number));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    assert(Math.min(...xs) > 0 && Math.max(...xs) < width - 1, `${label} touches a horizontal edge`);
    assert(Math.min(...ys) > 0 && Math.max(...ys) < height - 1, `${label} touches a vertical edge`);
}

const first = buildSheet();
const second = buildSheet();
// Two independent builds must be byte-identical.
assert(first.sheet.equals(second.sheet), "generation is not deterministic");
const { sheet, sheetW, sheetH, descriptor } = first;
const { cellWidth, cellHeight } = descriptor;
assert(sheetW === cellWidth * (PHASES + 1) && sheetH === cellHeight * DIRECTIONS.length, "unexpected sheet dimensions");
assert(descriptor.rows.map(({ type }) => type).join(",") === DIRECTIONS.join(","), "direction row order differs");

const palette = new Set([[0,0,0,0], ...Object.values(colors)].map((color) => color.join(",")));
// Reject antialiasing and accidental colors by inspecting every RGBA tuple.
for (let i = 0; i < sheet.length; i += 4) {
    assert(palette.has([...sheet.subarray(i, i + 4)].join(",")), `unexpected color at byte ${i}`);
}

descriptor.rows.forEach((row, rowIndex) => {
    // Descriptor offsets must point exactly at their generated directional row.
    assert(row.x === cellWidth && row.y === rowIndex * cellHeight, `${row.type} row origin is invalid`);
    assert(row.phases === PHASES && row.loops === true && row.idleX === 0
        && row.frameIntervalMs === FRAME_INTERVAL_MS, `${row.type} animation metadata is invalid`);
    assert(row.bounds.points.length >= 3, `${row.type} has no collision polygon`);
    const walkHashes = new Set();
    for (let column = 0; column <= PHASES; column++) {
        const frame = framePixels(sheet, sheetW, cellWidth, cellHeight, column, rowIndex);
        assertConnected(frame, cellWidth, cellHeight, `${row.type} column ${column}`);
        if (column > 0) walkHashes.add(createHash("sha256").update(frame).digest("hex"));
    }
    // A valid walk cycle cannot contain repeated phase artwork.
    assert(walkHashes.size === PHASES, `${row.type} contains duplicate walking phases`);
});

console.log(`validated ${DIRECTIONS.length * (PHASES + 1)} anthro fox cells (${sheetW}x${sheetH}), deterministic and descriptor-aligned`);
