import { blitGrid } from "../lib/sprite-sheet.mjs";
import { constants } from "./constants.mjs";
import { collectOpaquePoints, convexHull, hullToBounds } from "./geometry.mjs";
import { buildFrame } from "./walk.mjs";
import { buildCurlFrame } from "./curl.mjs";
import { buildUncurlFrame } from "./uncurl.mjs";
import { buildSleepTurnFrame } from "./sleep-turn.mjs";

const { grid: GRID, block: BLOCK, cellPx: CELL_PX, phases: PHASES, frameIntervalMs: FRAME_INTERVAL_MS } = constants;
const DIR_ORDER = constants.dirs.order;

export const ROWS = [...DIR_ORDER, "CURL", "UNCURL", "SLEEPTURN"];

// curl-family rows: no idle column. "curl"/"uncurl" are one-shot transitions
// (see SpriteFrame.loops), "sleepTurn" loops since it ends back where it started
const CURL_FAMILY_ROWS = [
    { type: "curl", build: buildCurlFrame, loops: false },
    { type: "uncurl", build: buildUncurlFrame, loops: false },
    { type: "sleepTurn", build: buildSleepTurnFrame, loops: true },
];

/**
 * builds the full fox sprite sheet: the 8 direction walk-cycle rows (each
 * with a leading idle column) followed by the curl-family rows, plus a
 * `SpriteSheetDescriptor`-shaped json descriptor for each row's layout and
 * collision bounds.
 *
 * @returns {{sheetW: number, sheetH: number, sheet: Buffer, descriptor: object}} the rendered sheet and its descriptor.
 */
export function buildSheet() {
    const sheetW = CELL_PX * (PHASES + 1); // +1 for the direction rows' leading idle column
    const sheetH = CELL_PX * ROWS.length;
    const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
    const rowDescriptors = [];

    DIR_ORDER.forEach((dirName, row) => {
        // reuse walk phase 0 as the idle pose: sine-wave strides are exactly zero there
        const idleGrid = buildFrame(dirName, 0);
        blitGrid(sheet, sheetW, idleGrid, GRID, BLOCK, 0, row * CELL_PX);
        const hullPoints = [];
        collectOpaquePoints(idleGrid, hullPoints);
        for (let phase = 0; phase < PHASES; phase++) {
            const grid = buildFrame(dirName, phase);
            blitGrid(sheet, sheetW, grid, GRID, BLOCK, (phase + 1) * CELL_PX, row * CELL_PX);
            collectOpaquePoints(grid, hullPoints);
        }
        rowDescriptors.push({
            type: dirName,
            x: CELL_PX, // phase 1 sits in column 1, column 0 is the idle frame
            y: row * CELL_PX,
            phases: PHASES,
            loops: true, // the walk cycle repeats indefinitely
            frameIntervalMs: FRAME_INTERVAL_MS,
            idleX: 0,
            bounds: hullToBounds(convexHull(hullPoints)),
        });
    });

    CURL_FAMILY_ROWS.forEach(({ type, build, loops }, i) => {
        const row = DIR_ORDER.length + i;
        const hullPoints = [];
        for (let phase = 0; phase < PHASES; phase++) {
            const grid = build(phase);
            blitGrid(sheet, sheetW, grid, GRID, BLOCK, phase * CELL_PX, row * CELL_PX);
            collectOpaquePoints(grid, hullPoints);
        }
        rowDescriptors.push({
            type,
            x: 0,
            y: row * CELL_PX,
            phases: PHASES,
            loops,
            frameIntervalMs: FRAME_INTERVAL_MS,
            bounds: hullToBounds(convexHull(hullPoints)),
        });
    });

    const descriptor = {
        cellWidth: CELL_PX,
        cellHeight: CELL_PX,
        rows: rowDescriptors,
    };

    return { sheetW, sheetH, sheet, descriptor };
}
