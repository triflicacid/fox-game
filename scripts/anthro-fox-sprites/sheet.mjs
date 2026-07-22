import { blit } from "./raster.mjs";
import { buildIdlePoses, CELL_HEIGHT, CELL_WIDTH, DIRECTIONS } from "./poses.mjs";
import { buildWalkFrame } from "./walk.mjs";

export const PHASES = 8;

const FRONT_BOUNDS = [[-13,-31],[13,-31],[17,-24],[17,24],[12,32],[-12,32],[-17,24],[-17,-24]];
const SIDE_BOUNDS = [[-10,-31],[11,-31],[14,-23],[14,26],[9,32],[-9,32],[-14,26],[-14,-23]];
const DIAGONAL_BOUNDS = [[-12,-31],[12,-31],[16,-23],[16,25],[10,32],[-11,32],[-16,25],[-16,-23]];

/**
 * Selects body-focused collision bounds for a viewing direction.
 *
 * The decorative tail is intentionally excluded so its animation cannot alter
 * world collision behavior.
 *
 * @param {string} direction - Compass direction of the descriptor row.
 * @returns {{points: {x: number, y: number}[]}} Polygon relative to the cell centre.
 */
function boundsFor(direction) {
    const points = direction === "E" || direction === "W"
        ? SIDE_BOUNDS
        : direction.length === 2 ? DIAGONAL_BOUNDS : FRONT_BOUNDS;
    return { points: points.map(([x, y]) => ({ x, y })) };
}

/**
 * Builds the original fox-compatible sheet and descriptor layout.
 *
 * Each directional row contains an idle pose in column zero followed by eight
 * looping walk phases. Rows follow clockwise compass order from north.
 *
 * @returns {{sheetW: number, sheetH: number, sheet: Buffer, descriptor: object, idles: Record<string, Buffer>}} Generated assets.
 */
export function buildSheet() {
    const sheetW = CELL_WIDTH * (PHASES + 1);
    const sheetH = CELL_HEIGHT * DIRECTIONS.length;
    const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);
    const idles = buildIdlePoses();
    const rows = [];
    DIRECTIONS.forEach((direction, row) => {
        const y = row * CELL_HEIGHT;
        // Column zero is selected by locateIdleSprite at runtime.
        blit(idles[direction], CELL_WIDTH, CELL_HEIGHT, sheet, sheetW, 0, y);
        // Animated phases begin at x=CELL_WIDTH, matching each row descriptor.
        for (let phase = 0; phase < PHASES; phase++) {
            const frame = buildWalkFrame(idles[direction], direction, phase, CELL_WIDTH, CELL_HEIGHT);
            blit(frame, CELL_WIDTH, CELL_HEIGHT, sheet, sheetW, (phase + 1) * CELL_WIDTH, y);
        }
        rows.push({
            type: direction,
            x: CELL_WIDTH,
            y,
            phases: PHASES,
            loops: true,
            idleX: 0,
            bounds: boundsFor(direction),
        });
    });
    return {
        sheetW,
        sheetH,
        sheet,
        descriptor: { cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, rows },
        idles,
    };
}
