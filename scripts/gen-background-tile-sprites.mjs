import { writeFileSync } from "node:fs";
import { writePng } from "./lib/png-writer.mjs";

const GRID = 16; // logical cells per tile edge
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;

/**
 * Returns a deterministic pseudo-random value for a grid cell.
 *
 * @param {number} seed - Tile seed.
 * @param {number} x - Grid cell x coordinate.
 * @param {number} y - Grid cell y coordinate.
 * @returns {number} A value in the range `[0, 1)`.
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
 * Selects a color from a weighted palette.
 *
 * @param {{color: number[], weight: number}[]} palette - Available colors and weights.
 * @param {number} seed - Tile seed.
 * @param {number} x - Grid cell x coordinate.
 * @param {number} y - Grid cell y coordinate.
 * @returns {number[]} The selected RGBA color.
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

const GRASS_VARIANTS = [
    {
        seed: 1001,
        palette: [
            { color: [86, 148, 58, 255], weight: 60 },  // base
            { color: [70, 128, 46, 255], weight: 22 },  // shaded blade
            { color: [112, 172, 74, 255], weight: 12 }, // sunlit blade
            { color: [156, 196, 88, 255], weight: 6 },  // fleck
        ],
    },
    {
        seed: 1002,
        palette: [
            { color: [93, 152, 64, 255], weight: 60 },
            { color: [76, 132, 50, 255], weight: 22 },
            { color: [118, 176, 80, 255], weight: 12 },
            { color: [160, 198, 92, 255], weight: 6 },
        ],
    },
    {
        seed: 1003,
        palette: [
            { color: [78, 140, 54, 255], weight: 60 },
            { color: [62, 118, 42, 255], weight: 22 },
            { color: [104, 164, 70, 255], weight: 12 },
            { color: [148, 190, 82, 255], weight: 6 },
        ],
    },
];

const DIRT = {
    seed: 2001,
    palette: [
        { color: [124, 92, 62, 255], weight: 58 }, // base
        { color: [104, 74, 48, 255], weight: 24 }, // shaded
        { color: [148, 112, 78, 255], weight: 12 }, // sunlit
        { color: [90, 66, 44, 255], weight: 6 },   // pebble
    ],
};

const GRAVEL = {
    seed: 3001,
    palette: [
        { color: [150, 148, 140, 255], weight: 54 }, // base
        { color: [128, 126, 118, 255], weight: 24 }, // shaded stone
        { color: [176, 174, 166, 255], weight: 16 }, // sunlit stone
        { color: [96, 94, 88, 255], weight: 6 },     // dark stone
    ],
};

// water uses fewer colors for a smoother look
const WATER_LIGHT = {
    seed: 4001,
    palette: [
        { color: [46, 137, 163, 255], weight: 88 }, // base
        { color: [78, 173, 194, 255], weight: 12 }, // shimmer
    ],
};

const WATER_DARK = {
    seed: 4002,
    palette: [
        { color: [14, 56, 84, 255], weight: 88 }, // base
        { color: [8, 38, 60, 255], weight: 12 },  // shimmer
    ],
};

// one row of the sheet, in column order.
const TILES = [
    { type: "grass1", ...GRASS_VARIANTS[0] },
    { type: "grass2", ...GRASS_VARIANTS[1] },
    { type: "grass3", ...GRASS_VARIANTS[2] },
    { type: "dirt", ...DIRT },
    { type: "gravel", ...GRAVEL },
    { type: "waterLight", ...WATER_LIGHT },
    { type: "waterDark", ...WATER_DARK },
];

/**
 * Builds the color grid for a tile.
 *
 * @param {{palette: {color: number[], weight: number}[], seed: number}} tile - Tile definition.
 * @returns {number[][]} The tile's colors in row-major order.
 */
function buildTileGrid(tile) {
    // generate one color per grid cell
    const grid = new Array(GRID * GRID);

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            grid[gy * GRID + gx] = pickColor(tile.palette, tile.seed, gx, gy);
        }
    }

    return grid;
}

/**
 * Copies a tile into the sprite sheet.
 *
 * @param {Buffer} sheet - Sheet pixel buffer.
 * @param {number} sheetW - Sheet width in pixels.
 * @param {number[][]} gridColors - Tile color grid.
 * @param {number} column - Destination tile column.
 * @returns {void} Nothing.
 */
function blitTile(sheet, sheetW, gridColors, column) {
    // tile origin
    const originX = column * CELL_PX;

    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            // color for this grid cell
            const [r, g, b, a] = gridColors[gy * GRID + gx];

            // expand logical cell into pixels
            for (let by = 0; by < BLOCK; by++) {
                const py = gy * BLOCK + by;

                for (let bx = 0; bx < BLOCK; bx++) {
                    const px = originX + gx * BLOCK + bx;
                    const idx = (py * sheetW + px) * 4;

                    // write rgba
                    sheet[idx] = r;
                    sheet[idx + 1] = g;
                    sheet[idx + 2] = b;
                    sheet[idx + 3] = a;
                }
            }
        }
    }
}

const sheetW = CELL_PX * TILES.length;
const sheetH = CELL_PX;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

// build sheet rows and descriptors
const rowDescriptors = TILES.map((tile, column) => {
    blitTile(sheet, sheetW, buildTileGrid(tile), column);

    return {
        type: tile.type,
        x: column * CELL_PX,
        y: 0,
        interactable: false, // background tiles
    };
});

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const outPath = process.argv[2];
const descriptorOutPath = process.argv[3] ?? "static/background-tile-sprites.json";
if (!outPath) throw new Error("usage: node gen-background-tile-sprites.mjs <pngOutPath> [descriptorOutPath]");
writePng(outPath, sheetW, sheetH, sheet);
writeFileSync(descriptorOutPath, JSON.stringify(descriptor, null, 2) + "\n");
console.log(`wrote sprite sheet descriptor to ${descriptorOutPath}`);
console.log("tile order:", TILES.map((tile) => tile.type).join(", "));
