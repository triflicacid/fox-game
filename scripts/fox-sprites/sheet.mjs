import { blitGrid } from "../lib/sprite-sheet.mjs";
import { constants } from "./constants.mjs";
import { collectOpaquePoints, convexHull, hullToBounds } from "./geometry.mjs";
import { buildFrame } from "./walk.mjs";
import { buildCurlFrame } from "./curl.mjs";
import { buildUncurlFrame } from "./uncurl.mjs";
import { buildSleepTurnFrame } from "./sleep-turn.mjs";
import { buildLeapFrame, getLeapCanvasSize } from "./leap.mjs";
import { buildSwimFrame } from "./swim.mjs";

const { grid: GRID, block: BLOCK, cellPx: CELL_PX, phases: PHASES } = constants;
const DIR_ORDER = constants.dirs.order;

export const ROWS = [
    ...DIR_ORDER,
    ...DIR_ORDER.map((dirName) => `DASH_${dirName}`),
    ...DIR_ORDER.map((dirName) => `SWIM_${dirName}`),
    "CURL",
    "UNCURL",
    "SLEEPTURN",
];

// NW-facing one-shot/looping rows: no idle column. "curl"/"uncurl" are
// one-shot transitions (see SpriteFrame.loops), "sleepTurn" loops since it
// ends back where it started
const CURL_FAMILY_ROWS = [
    { type: "curl", build: buildCurlFrame, loops: false },
    { type: "uncurl", build: buildUncurlFrame, loops: false },
    { type: "sleepTurn", build: buildSleepTurnFrame, loops: true },
];

/**
 * builds the full fox sprite sheet: the 8 direction walk-cycle rows (each
 * with a leading idle column), the 8 per-direction dash rows, the 8
 * per-direction swim rows, then the curl-family rows, plus a
 * `SpriteSheetDescriptor`-shaped json descriptor for
 * each row's layout and collision bounds. Rows are stacked with a running Y
 * cursor rather than a fixed per-row height, since the dash rows use a
 * larger cell size than the rest (the leap's stretched tail doesn't fit the
 * standard 24-cell grid) - each row descriptor carries its own `width`/
 * `height` when it differs from `descriptor.cellWidth`/`cellHeight`.
 *
 * @returns {{sheetW: number, sheetH: number, sheet: Buffer, descriptor: object}} the rendered sheet and its descriptor.
 */
export function buildSheet() {
    // each direction's dash canvas is tailored to its own reach (see
    // leap.mjs): cardinal directions are long and narrow, diagonals more
    // evenly spread, so row pixel sizes are computed per direction rather
    // than sharing one size the way the other row groups do
    const dashRowSizes = DIR_ORDER.map((dirName) => {
        const { gridW, gridH } = getLeapCanvasSize(dirName);
        return { width: gridW * BLOCK, height: gridH * BLOCK };
    });

    const movementRowWidth = CELL_PX * (PHASES + 1); // +1 for the direction rows' leading idle column
    const dashRowWidth = Math.max(...dashRowSizes.map((size) => size.width * PHASES));
    const curlRowWidth = CELL_PX * PHASES;
    const sheetW = Math.max(movementRowWidth, dashRowWidth, curlRowWidth);
    const sheetH = CELL_PX * DIR_ORDER.length // walk rows
        + dashRowSizes.reduce((sum, size) => sum + size.height, 0)
        + CELL_PX * DIR_ORDER.length // swim rows
        + CELL_PX * CURL_FAMILY_ROWS.length;
    const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
    const rowDescriptors = [];
    let y = 0;

    DIR_ORDER.forEach((dirName) => {
        // reuse walk phase 0 as the idle pose: sine-wave strides are exactly zero there
        const idleGrid = buildFrame(dirName, 0);
        blitGrid(sheet, sheetW, idleGrid, GRID, BLOCK, 0, y);
        const hullPoints = [];
        collectOpaquePoints(idleGrid, hullPoints);
        for (let phase = 0; phase < PHASES; phase++) {
            const grid = buildFrame(dirName, phase);
            blitGrid(sheet, sheetW, grid, GRID, BLOCK, (phase + 1) * CELL_PX, y);
            collectOpaquePoints(grid, hullPoints);
        }
        rowDescriptors.push({
            type: dirName,
            x: CELL_PX, // phase 1 sits in column 1, column 0 is the idle frame
            y,
            phases: PHASES,
            loops: true, // the walk cycle repeats indefinitely
            idleX: 0,
            bounds: hullToBounds(convexHull(hullPoints)),
        });
        y += CELL_PX;
    });

    DIR_ORDER.forEach((dirName, i) => {
        const { gridW, gridH } = getLeapCanvasSize(dirName);
        const { width, height } = dashRowSizes[i];
        const hullPoints = [];
        for (let phase = 0; phase < PHASES; phase++) {
            const grid = buildLeapFrame(dirName, phase);
            blitGrid(sheet, sheetW, grid, gridW, BLOCK, phase * width, y, gridH);
            collectOpaquePoints(grid, hullPoints, gridW, BLOCK, gridH);
        }
        rowDescriptors.push({
            type: `dash${dirName}`,
            x: 0,
            y,
            width,
            height,
            phases: PHASES,
            loops: false, // the leap is a one-shot burst, not a cycle
            bounds: hullToBounds(convexHull(hullPoints), width, height),
        });
        y += height;
    });

    DIR_ORDER.forEach((dirName) => {
        const hullPoints = [];
        for (let phase = 0; phase < PHASES; phase++) {
            blitGrid(sheet, sheetW, buildSwimFrame(dirName, phase), GRID, BLOCK, phase * CELL_PX, y);
            // the splash spray is scenery, so it stays out of the collision hull
            collectOpaquePoints(buildSwimFrame(dirName, phase, false), hullPoints);
        }
        rowDescriptors.push({
            type: `swim${dirName}`,
            x: 0,
            y,
            phases: PHASES,
            loops: true, // the paddle cycle repeats indefinitely
            bounds: hullToBounds(convexHull(hullPoints)),
        });
        y += CELL_PX;
    });

    CURL_FAMILY_ROWS.forEach(({ type, build, loops }) => {
        const hullPoints = [];
        for (let phase = 0; phase < PHASES; phase++) {
            const grid = build(phase);
            blitGrid(sheet, sheetW, grid, GRID, BLOCK, phase * CELL_PX, y);
            collectOpaquePoints(grid, hullPoints);
        }
        rowDescriptors.push({
            type,
            x: 0,
            y,
            phases: PHASES,
            loops,
            bounds: hullToBounds(convexHull(hullPoints)),
        });
        y += CELL_PX;
    });

    const descriptor = {
        cellWidth: CELL_PX,
        cellHeight: CELL_PX,
        rows: rowDescriptors,
    };

    return { sheetW, sheetH, sheet, descriptor };
}
