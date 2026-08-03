import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";

const GRID = 16; // logical cells per tile edge - matches the ground tile grid, so log/leaf tiles align 1:1 with it
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;
const CENTER = (GRID - 1) / 2;

/**
 * returns a deterministic pseudo-random value for a grid cell.
 *
 * @param {number} seed - tile seed.
 * @param {number} x - grid cell x coordinate.
 * @param {number} y - grid cell y coordinate.
 * @returns {number} a value in the range `[0, 1)`.
 */
function hash(seed, x, y) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
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
    const total = palette.reduce((sum, entry) => sum + entry.weight, 0);
    let t = hash(seed, x, y) * total;
    for (const entry of palette) {
        if (t < entry.weight) return entry.color;
        t -= entry.weight;
    }
    return palette[palette.length - 1].color;
}

// distinct from each tile's color seed so "is this cell a gap" doesn't correlate with "which color"
const GAP_SEED_OFFSET = 5000;

const LOG_RADIUS = 7; // the "round" variant's trunk radius, leaving its own tile corners outside it
const RING_WIDTH = 2.2; // concentric tree-ring banding, viewed from above
const PITH_RADIUS = 1.4;

/**
 * builds a top-down cut-log tile: concentric ring bands (alternating
 * palettes by ring parity) with a small dark pith at the centre.
 *
 * Two shapes: `radius: null` fills the whole square tile edge-to-edge (the
 * "square" variant, like Minecraft's log texture). A finite `radius` masks
 * it into a circular stump instead (the "round" variant); cells outside
 * that circle use `cornerLeaves`' palette/gap-chance rather than staying
 * transparent, so a diagonally adjacent leaf tile visually connects into
 * the trunk tile's corners instead of leaving a bare gap of ground showing.
 *
 * @param {object} log - log definition.
 * @param {number} log.seed - color seed.
 * @param {[{color: number[], weight: number}[], {color: number[], weight: number}[]]} log.ringPalettes - palettes used on even/odd rings.
 * @param {number[]} log.pithColor - rgba color for the centre pith.
 * @param {number|null} log.radius - trunk radius, or `null` for a full square tile.
 * @param {{seed: number, palette: {color: number[], weight: number}[], gapChance: number}} [log.cornerLeaves] - leaf texture for the area outside `radius`; only used when `radius` is finite.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildLogGrid({ seed, ringPalettes, pithColor, radius, cornerLeaves }) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const x = gx - CENTER;
            const y = gy - CENTER;
            const dist = Math.sqrt(x * x + y * y);

            if (radius !== null && dist > radius) {
                if (cornerLeaves && hash(cornerLeaves.seed + GAP_SEED_OFFSET, gx, gy) >= cornerLeaves.gapChance) {
                    grid[gy * GRID + gx] = pickColor(cornerLeaves.palette, cornerLeaves.seed, gx, gy);
                }
                continue;
            }

            if (dist <= PITH_RADIUS) {
                grid[gy * GRID + gx] = pithColor;
                continue;
            }

            const ringIndex = Math.floor(dist / RING_WIDTH);
            grid[gy * GRID + gx] = pickColor(ringPalettes[ringIndex % 2], seed, gx, gy);
        }
    }
    return grid;
}

/**
 * builds a leaf tile: a weighted-palette texture covering the whole tile
 * (so adjacent leaf tiles tessellate into one continuous canopy), with
 * random fully-transparent gaps so the ground/entities beneath show through.
 *
 * @param {object} leaves - leaf definition.
 * @param {number} leaves.seed - color seed.
 * @param {{color: number[], weight: number}[]} leaves.palette - leaf color palette.
 * @param {number} leaves.gapChance - probability `[0, 1)` a cell is left transparent.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildLeafGrid({ seed, palette, gapChance }) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            if (hash(seed + GAP_SEED_OFFSET, gx, gy) < gapChance) continue; // a gap in the canopy
            grid[gy * GRID + gx] = pickColor(palette, seed, gx, gy);
        }
    }
    return grid;
}

const OAK_LOG = {
    seed: 8001,
    ringPalettes: [
        [
            { color: [92, 64, 40, 255], weight: 70 },
            { color: [78, 54, 34, 255], weight: 22 },
            { color: [104, 74, 48, 255], weight: 8 },
        ],
        [
            { color: [104, 76, 48, 255], weight: 70 },
            { color: [88, 62, 38, 255], weight: 22 },
            { color: [116, 86, 56, 255], weight: 8 },
        ],
    ],
    pithColor: [54, 36, 22, 255],
};

const BIRCH_LOG = {
    seed: 8002,
    ringPalettes: [
        [
            { color: [225, 220, 204, 255], weight: 66 },
            { color: [204, 198, 182, 255], weight: 22 },
            { color: [238, 234, 222, 255], weight: 6 },
            { color: [40, 36, 32, 255], weight: 6 }, // birch's characteristic dark bark streaks
        ],
        [
            { color: [214, 208, 192, 255], weight: 66 },
            { color: [194, 188, 172, 255], weight: 22 },
            { color: [230, 226, 214, 255], weight: 6 },
            { color: [40, 36, 32, 255], weight: 6 },
        ],
    ],
    pithColor: [180, 172, 156, 255],
};

// deliberately darker and more saturated than every forest-floor variant (see
// FOREST_VARIANTS in gen-background-tile-sprites.mjs) so oak canopy reads as shadowed
// foliage above the ground rather than blending into it
const OAK_LEAVES = {
    seed: 7001,
    gapChance: 0.12,
    palette: [
        { color: [24, 52, 20, 255], weight: 60 },  // base
        { color: [16, 38, 14, 255], weight: 20 },  // shaded
        { color: [34, 68, 28, 255], weight: 16 },  // sunlit
        { color: [44, 80, 34, 255], weight: 4 },   // fleck
    ],
};

const BIRCH_LEAVES = {
    seed: 7002,
    gapChance: 0.22, // birch foliage reads lighter/sparser than oak
    palette: [
        { color: [120, 150, 64, 255], weight: 60 },
        { color: [100, 132, 52, 255], weight: 20 },
        { color: [140, 168, 82, 255], weight: 16 },
        { color: [156, 182, 98, 255], weight: 4 },
    ],
};

// row 0: oak (square log, round log, leaves); row 1: birch (square log, round log, leaves)
const TILE_ROWS = [
    [
        { type: "oakLogSquare", build: () => buildLogGrid({ ...OAK_LOG, radius: null }) },
        { type: "oakLogRound", build: () => buildLogGrid({ ...OAK_LOG, radius: LOG_RADIUS, cornerLeaves: OAK_LEAVES }) },
        { type: "oakLeaves", build: () => buildLeafGrid(OAK_LEAVES) },
    ],
    [
        { type: "birchLogSquare", build: () => buildLogGrid({ ...BIRCH_LOG, radius: null }) },
        { type: "birchLogRound", build: () => buildLogGrid({ ...BIRCH_LOG, radius: LOG_RADIUS, cornerLeaves: BIRCH_LEAVES }) },
        { type: "birchLeaves", build: () => buildLeafGrid(BIRCH_LEAVES) },
    ],
];

const sheetW = CELL_PX * Math.max(...TILE_ROWS.map((row) => row.length));
const sheetH = CELL_PX * TILE_ROWS.length;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

const rowDescriptors = TILE_ROWS.flatMap((tiles, row) => tiles.map((tile, column) => {
    const x = column * CELL_PX;
    const y = row * CELL_PX;
    blitGrid(sheet, sheetW, tile.build(), GRID, BLOCK, x, y);

    return {
        type: tile.type,
        x,
        y,
        interactable: false, // decorative props, not yet collidable
    };
}));

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-tree-sprites.mjs", "static/tree-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("tree tiles:", TILE_ROWS.map((row) => row.map((tile) => tile.type).join(", ")).join(" | "));
