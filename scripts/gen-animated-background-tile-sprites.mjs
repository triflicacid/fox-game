import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";

const GRID = 16; // logical cells per tile edge
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;
const PHASES = 3; // frames per water type's shimmer loop
const SHIFT_CELLS_PER_PHASE = 1; // how far the speckle field scrolls down each phase, in grid cells (-> BLOCK real pixels)

/**
 * returns a deterministic pseudo-random value for a grid cell.
 *
 * @param {number} seed - tile seed.
 * @param {number} x - grid cell x coordinate.
 * @param {number} y - grid cell y coordinate.
 * @returns {number} a value in the range `[0, 1)`.
 */
function hash(seed, x, y) {
    // mix coordinates into a hash
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;

    // scramble bits
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;

    // normalize to [0, 1)
    return h / 0xffffffff;
}

/**
 * selects a color from a weighted palette.
 *
 * @param {{color: number[], weight: number}[]} palette - available colors and weights.
 * @param {number} seed - tile seed.
 * @param {number} x - grid cell x coordinate.
 * @param {number} y - grid cell y coordinate.
 * @returns {number[]} the selected rgba color.
 */
function pickColor(palette, seed, x, y) {
    // compute total weight
    const total = palette.reduce((sum, entry) => sum + entry.weight, 0);

    // pick a weighted value
    let t = hash(seed, x, y) * total;
    for (const entry of palette) {
        if (t < entry.weight) return entry.color;
        t -= entry.weight;
    }

    // fallback for rounding
    return palette[palette.length - 1].color;
}

// shared per water-body timing, so light and dark variants of the same body
// (which mix within a single lake/oasis - see lakes.ts/oases.ts) always
// scroll at the exact same rate - otherwise their shared "global" sync only
// keeps each variant in step with itself, and the body's surface would tear
// at the light/dark boundary as the two variants drift apart over time
const LAKE_TIMING = { frameIntervalMs: 250, sync: "global" };
const OASIS_TIMING = { frameIntervalMs: 250, sync: "global" };

// shallow/sunlit water
const WATER_LIGHT = {
    seed: 4001,
    ...LAKE_TIMING,
    palette: [
        { color: [46, 137, 163, 255], weight: 88 }, // base
        { color: [78, 173, 194, 255], weight: 12 }, // shimmer
    ],
};

// deep/shaded water
const WATER_DARK = {
    seed: 4002,
    ...LAKE_TIMING,
    palette: [
        { color: [14, 56, 84, 255], weight: 88 }, // base
        { color: [8, 38, 60, 255], weight: 12 },  // shimmer
    ],
};

// distinct turquoise palette makes oasis water recognizable against normal lake water
const OASIS_WATER_LIGHT = {
    seed: 6001,
    ...OASIS_TIMING,
    palette: [
        { color: [36, 159, 164, 255], weight: 88 }, // base
        { color: [79, 196, 190, 255], weight: 12 }, // shimmer
    ],
};

const OASIS_WATER_DARK = {
    seed: 6002,
    ...OASIS_TIMING,
    palette: [
        { color: [13, 89, 108, 255], weight: 88 }, // base
        { color: [20, 121, 128, 255], weight: 12 }, // shimmer
    ],
};

// one row per water type, PHASES columns per row
const WATER_TYPES = [
    { type: "water.light", ...WATER_LIGHT },
    { type: "water.dark", ...WATER_DARK },
    { type: "water.oasis.light", ...OASIS_WATER_LIGHT },
    { type: "water.oasis.dark", ...OASIS_WATER_DARK },
];

/**
 * builds a water type's speckle field once - the same grid every phase
 * scrolls a view over, so the flecks themselves never relocate or
 * re-randomize, only slide.
 *
 * @param {{palette: {color: number[], weight: number}[], seed: number}} tile - water type definition.
 * @returns {number[][]} the field's colors in row-major order.
 */
function buildBaseGrid(tile) {
    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            grid[gy * GRID + gx] = pickColor(tile.palette, tile.seed, gx, gy);
        }
    }

    return grid;
}

/**
 * builds one phase's color grid by reading `baseGrid` through a
 * vertically-scrolled window - each phase looks `phase * SHIFT_CELLS_PER_PHASE`
 * cells further up the field than the last, so its speckles appear to drift
 * downward together, wrapping seamlessly since the field is stochastic noise
 * with no seam to reveal.
 *
 * @param {number[][]} baseGrid - the water type's speckle field - see {@link buildBaseGrid}.
 * @param {number} phase - 0-indexed phase to build.
 * @returns {number[][]} the phase's colors in row-major order.
 */
function buildPhaseGrid(baseGrid, phase) {
    const shift = (phase * SHIFT_CELLS_PER_PHASE) % GRID;
    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        const sourceY = (gy - shift + GRID) % GRID;
        for (let gx = 0; gx < GRID; gx++) {
            grid[gy * GRID + gx] = baseGrid[sourceY * GRID + gx];
        }
    }

    return grid;
}

const sheetW = CELL_PX * PHASES;
const sheetH = CELL_PX * WATER_TYPES.length;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

const rowDescriptors = WATER_TYPES.map((tile, row) => {
    const y = row * CELL_PX;
    const baseGrid = buildBaseGrid(tile);
    for (let phase = 0; phase < PHASES; phase++) {
        blitGrid(sheet, sheetW, buildPhaseGrid(baseGrid, phase), GRID, BLOCK, phase * CELL_PX, y);
    }

    return {
        type: tile.type,
        x: 0,
        y,
        phases: PHASES,
        frameIntervalMs: tile.frameIntervalMs,
        sync: tile.sync,
    };
});

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-animated-background-tile-sprites.mjs", "static/animated-background-tile-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("water types:", WATER_TYPES.map((tile) => tile.type).join(", "));
