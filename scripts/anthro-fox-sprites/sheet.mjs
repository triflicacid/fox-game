import { blit, scale2x } from "./raster.mjs";
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
 * world collision behavior. Coordinates are already scaled to the 2× output
 * cell size.
 *
 * @param {string} direction - Compass direction of the descriptor row.
 * @returns {{points: {x: number, y: number}[]}} Polygon relative to the cell centre.
 */
function boundsFor(direction) {
    const points = direction === "E" || direction === "W"
        ? SIDE_BOUNDS
        : direction.length === 2 ? DIAGONAL_BOUNDS : FRONT_BOUNDS;
    // Coordinates are doubled to match the 2× upscaled cell dimensions.
    return { points: points.map(([x, y]) => ({ x: x * 2, y: y * 2 })) };
}

/**
 * Builds the original fox-compatible sheet and descriptor layout.
 *
 * Each directional row contains an idle pose in column zero followed by eight
 * looping walk phases. Rows follow clockwise compass order from north. The
 * entire sheet is upscaled 2× using nearest-neighbor interpolation so the
 * upright anthro fox is proportionally larger than the top-down quadruped fox.
 *
 * @returns {{sheetW: number, sheetH: number, sheet: Buffer, descriptor: object, idles: Record<string, Buffer>}} Generated assets, all at 2× resolution.
 */
export function buildSheet() {
    const rawW = CELL_WIDTH * (PHASES + 1);
    const rawH = CELL_HEIGHT * DIRECTIONS.length;
    const rawSheet = Buffer.alloc(rawW * rawH * 4, 0);
    const idles = buildIdlePoses();
    const rows = [];

    DIRECTIONS.forEach((direction, row) => {
        const y = row * CELL_HEIGHT;
        // Column zero is selected by locateIdleSprite at runtime.
        blit(idles[direction], CELL_WIDTH, CELL_HEIGHT, rawSheet, rawW, 0, y);
        // Animated phases begin at x=CELL_WIDTH, matching each row descriptor.
        for (let phase = 0; phase < PHASES; phase++) {
            const frame = buildWalkFrame(idles[direction], direction, phase, CELL_WIDTH, CELL_HEIGHT);
            blit(frame, CELL_WIDTH, CELL_HEIGHT, rawSheet, rawW, (phase + 1) * CELL_WIDTH, y);
        }
    });

    // Scale the entire sheet and all idle frames 2× so the upright anthro fox
    // appears proportionally larger than the top-down quadruped fox in-game.
    const scaledCellW = CELL_WIDTH * 2;
    const scaledCellH = CELL_HEIGHT * 2;
    const sheetW = rawW * 2;
    const sheetH = rawH * 2;
    const sheet = scale2x(rawSheet, rawW, rawH);
    const scaledIdles = Object.fromEntries(
        Object.entries(idles).map(([dir, frame]) => [dir, scale2x(frame, CELL_WIDTH, CELL_HEIGHT)]),
    );

    DIRECTIONS.forEach((direction, row) => {
        rows.push({
            type: direction,
            x: scaledCellW,
            y: row * scaledCellH,
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
        descriptor: { cellWidth: scaledCellW, cellHeight: scaledCellH, rows },
        idles: scaledIdles,
    };
}
