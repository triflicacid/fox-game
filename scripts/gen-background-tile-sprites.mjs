import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";

const GRID = 16; // logical cells per tile edge
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;

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

// Keep texture categories in the same cells across depth variants so a colour
// transition does not also rearrange every blade and fleck.
const GRASS_TEXTURE_SEED = 1001;
const GRASS_VARIANTS = [
    {
        seed: GRASS_TEXTURE_SEED,
        palette: [
            { color: [84, 146, 58, 255], weight: 78 },  // base
            { color: [71, 129, 49, 255], weight: 12 },  // shaded blade
            { color: [103, 164, 73, 255], weight: 8 },  // sunlit blade
            { color: [124, 174, 84, 255], weight: 2 },  // subdued fleck
        ],
    },
    {
        seed: GRASS_TEXTURE_SEED,
        palette: [
            { color: [94, 155, 70, 255], weight: 78 },
            { color: [80, 137, 59, 255], weight: 12 },
            { color: [113, 173, 84, 255], weight: 8 },
            { color: [132, 183, 96, 255], weight: 2 },
        ],
    },
    {
        seed: GRASS_TEXTURE_SEED,
        palette: [
            { color: [74, 136, 52, 255], weight: 78 },
            { color: [61, 119, 44, 255], weight: 12 },
            { color: [92, 154, 66, 255], weight: 8 },
            { color: [111, 164, 77, 255], weight: 2 },
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

// distinct turquoise palette makes oasis water recognizable against normal lake water
const OASIS_WATER_LIGHT = {
    seed: 6001,
    palette: [
        { color: [36, 159, 164, 255], weight: 88 }, // base
        { color: [79, 196, 190, 255], weight: 12 }, // shimmer
    ],
};

const OASIS_WATER_DARK = {
    seed: 6002,
    palette: [
        { color: [13, 89, 108, 255], weight: 88 }, // base
        { color: [20, 121, 128, 255], weight: 12 }, // shimmer
    ],
};

// cooler-toned than plains grass (more blue-green/teal) so forest floor reads as distinct
// cover without being too dark
const FOREST_TEXTURE_SEED = 8081;
const FOREST_VARIANTS = [
    {
        seed: FOREST_TEXTURE_SEED,
        palette: [
            { color: [70, 124, 74, 255], weight: 78 },   // base
            { color: [56, 104, 60, 255], weight: 12 },   // shaded blade
            { color: [88, 144, 90, 255], weight: 8 },    // sunlit blade
            { color: [104, 154, 100, 255], weight: 2 },  // subdued fleck
        ],
    },
    {
        seed: FOREST_TEXTURE_SEED,
        palette: [
            { color: [86, 142, 90, 255], weight: 78 },
            { color: [70, 120, 74, 255], weight: 12 },
            { color: [104, 164, 108, 255], weight: 8 },
            { color: [122, 176, 122, 255], weight: 2 },
        ],
    },
    {
        seed: FOREST_TEXTURE_SEED,
        palette: [
            { color: [54, 98, 58, 255], weight: 78 },
            { color: [42, 82, 46, 255], weight: 12 },
            { color: [70, 116, 74, 255], weight: 8 },
            { color: [88, 128, 84, 255], weight: 2 },
        ],
    },
];

// not in light-to-dark order - TILE_ROWS below assigns them to sand1/2/3 by actual brightness
const SAND_VARIANTS = [
    {
        seed: 5001,
        palette: [
            { color: [218, 190, 118, 255], weight: 68 }, // base
            { color: [195, 163, 91, 255], weight: 18 },  // shaded grain
            { color: [235, 211, 145, 255], weight: 10 }, // sunlit grain
            { color: [166, 132, 72, 255], weight: 4 },   // dark fleck
        ],
    },
    {
        seed: 5002,
        palette: [
            { color: [225, 199, 128, 255], weight: 68 },
            { color: [204, 174, 100, 255], weight: 18 },
            { color: [241, 219, 154, 255], weight: 10 },
            { color: [177, 142, 77, 255], weight: 4 },
        ],
    },
    {
        seed: 5003,
        palette: [
            { color: [210, 181, 108, 255], weight: 68 },
            { color: [185, 151, 80, 255], weight: 18 },
            { color: [229, 204, 135, 255], weight: 10 },
            { color: [157, 123, 66, 255], weight: 4 },
        ],
    },
];

// row 0: plains terrain and lake water; row 1: desert terrain and oasis water; row 2: forest terrain
const TILE_ROWS = [
    [
        { type: "grass1", ...GRASS_VARIANTS[0] },
        { type: "grass2", ...GRASS_VARIANTS[1] },
        { type: "grass3", ...GRASS_VARIANTS[2] },
        { type: "dirt", ...DIRT },
        { type: "gravel", ...GRAVEL },
        { type: "waterLight", ...WATER_LIGHT },
        { type: "waterDark", ...WATER_DARK },
    ],
    [
        { type: "sand1", ...SAND_VARIANTS[1] }, // brightest palette - see SAND_VARIANTS
        { type: "sand2", ...SAND_VARIANTS[0] },
        { type: "sand3", ...SAND_VARIANTS[2] }, // darkest palette
        { type: "oasisWaterLight", ...OASIS_WATER_LIGHT },
        { type: "oasisWaterDark", ...OASIS_WATER_DARK },
    ],
    [
        { type: "forest1", ...FOREST_VARIANTS[0] },
        { type: "forest2", ...FOREST_VARIANTS[1] },
        { type: "forest3", ...FOREST_VARIANTS[2] },
    ],
];

/**
 * builds the color grid for a tile.
 *
 * @param {{palette: {color: number[], weight: number}[], seed: number}} tile - tile definition.
 * @returns {number[][]} the tile's colors in row-major order.
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

const sheetW = CELL_PX * Math.max(...TILE_ROWS.map((row) => row.length));
const sheetH = CELL_PX * TILE_ROWS.length;
const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

// Build each visual row while keeping the descriptor's flat tile-entry format.
const rowDescriptors = TILE_ROWS.flatMap((tiles, row) => tiles.map((tile, column) => {
    const x = column * CELL_PX;
    const y = row * CELL_PX;
    blitGrid(sheet, sheetW, buildTileGrid(tile), GRID, BLOCK, x, y);

    return {
        type: tile.type,
        x,
        y,
        interactable: false, // background tiles
    };
}));

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-background-tile-sprites.mjs", "static/background-tile-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("tile rows:", TILE_ROWS.map((row) => row.map((tile) => tile.type).join(", ")).join(" | "));
