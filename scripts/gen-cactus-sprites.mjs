import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";

const GRID = 16; // logical cells per tile edge - matches the ground tile grid, so cactus tiles align 1:1 with it
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;
const CENTER = GRID / 2;

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

// Every cactus renders sub-tile and top-down, like a plant viewed from
// directly above - the same convention trees use (a cut-log trunk cross-
// section plus a canopy blob), rather than a side-elevation silhouette.
// Real geometry only fills roughly the middle half of the 16x16 grid,
// leaving a transparent margin so it reads as a small plant standing on the
// tile rather than filling it edge-to-edge.

/** Rib banding, by radial-ring parity from a blob's own center - same trick as tree bark's ring-parity palettes, which naturally reads as ribs radiating outward when viewed from above. */
const SAGUARO_GREEN = {
    seed: 9101,
    ringPalettes: [
        [
            { color: [86, 142, 70, 255], weight: 70 },  // lit rib - base
            { color: [70, 118, 56, 255], weight: 18 },  // lit rib - shaded
            { color: [104, 160, 86, 255], weight: 8 },  // lit rib - sunlit
            { color: [214, 214, 190, 255], weight: 4 }, // spine fleck
        ],
        [
            { color: [62, 104, 50, 255], weight: 70 },  // groove - base
            { color: [50, 88, 40, 255], weight: 18 },   // groove - shaded
            { color: [76, 124, 62, 255], weight: 8 },   // groove - sunlit
            { color: [214, 214, 190, 255], weight: 4 }, // spine fleck
        ],
    ],
    pithColor: [46, 78, 40, 255],
};

const BARREL_GREEN = {
    seed: 9111,
    ringPalettes: [
        [
            { color: [96, 150, 64, 255], weight: 70 },
            { color: [78, 126, 52, 255], weight: 18 },
            { color: [112, 168, 80, 255], weight: 8 },
            { color: [214, 214, 190, 255], weight: 4 },
        ],
        [
            { color: [70, 112, 46, 255], weight: 70 },
            { color: [58, 96, 38, 255], weight: 18 },
            { color: [84, 132, 56, 255], weight: 8 },
            { color: [214, 214, 190, 255], weight: 4 },
        ],
    ],
    pithColor: [52, 86, 36, 255],
};

/** Real saguaro blossoms are white with a yellow throat - one accurate bloom, centered on the crown regardless of which arms are present. */
const SAGUARO_FLOWER = { seed: 9131, radius: 2.1, palette: [
    { color: [246, 241, 228, 255], weight: 60 },
    { color: [222, 214, 196, 255], weight: 20 },
    { color: [235, 196, 60, 255], weight: 20 }, // stamen fleck
] };

const FLOWER_PALETTES = {
    pink: { seed: 9121, palette: [
        { color: [232, 122, 178, 255], weight: 65 },
        { color: [210, 96, 156, 255], weight: 22 },
        { color: [235, 196, 60, 255], weight: 13 }, // stamen fleck
    ] },
    yellow: { seed: 9122, palette: [
        { color: [247, 199, 64, 255], weight: 65 },
        { color: [224, 170, 40, 255], weight: 22 },
        { color: [255, 240, 210, 255], weight: 13 },
    ] },
    white: { seed: 9123, palette: [
        { color: [246, 241, 228, 255], weight: 65 },
        { color: [222, 214, 196, 255], weight: 22 },
        { color: [235, 196, 60, 255], weight: 13 }, // stamen fleck
    ] },
};

const RING_WIDTH = 1.15; // concentric rib banding, viewed from above - same idea as tree logs' RING_WIDTH
const PITH_RADIUS = 0.9;

/** Points sampled around each blob's circumference before hulling - enough to read as round once several blobs merge into one polygon. */
const BOUNDS_SAMPLES = 10;

/**
 * signed area (doubled) of the turn `o -> a -> b` - positive for a
 * counter-clockwise turn in a standard (y-up) axis sense.
 *
 * @param {{x: number, y: number}} o - turn's origin point.
 * @param {{x: number, y: number}} a - turn's first leg endpoint.
 * @param {{x: number, y: number}} b - turn's second leg endpoint.
 * @returns {number} the cross product `(a - o) x (b - o)`.
 */
function crossProduct(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * computes the convex hull of a point set (Andrew's monotone chain).
 *
 * @param {{x: number, y: number}[]} points - input points, not required to be sorted or de-duplicated.
 * @returns {{x: number, y: number}[]} the hull's vertices.
 */
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

/**
 * builds a convex collision polygon (in pixels, relative to the cell's
 * centre) enclosing every given blob - the union of one or more circles,
 * approximated by sampling each circle's circumference and hulling the
 * result. Kept tight to the plant's actual silhouette rather than the
 * whole tile, since these sprites render sub-tile - see `SpriteBounds`.
 *
 * @param {{cx: number, cy: number, radius: number}[]} blobs - circles to enclose, in the same cell-unit space the color geometry uses.
 * @returns {{points: {x: number, y: number}[]}} the collision bounds.
 */
function buildBounds(blobs) {
    const samples = [];
    for (const blob of blobs) {
        const pxCx = (blob.cx - CENTER) * BLOCK;
        const pxCy = (blob.cy - CENTER) * BLOCK;
        const pxR = blob.radius * BLOCK;
        for (let k = 0; k < BOUNDS_SAMPLES; k++) {
            const angle = (2 * Math.PI * k) / BOUNDS_SAMPLES;
            samples.push({x: Math.round(pxCx + pxR * Math.cos(angle)), y: Math.round(pxCy + pxR * Math.sin(angle))});
        }
    }
    return {points: convexHull(samples)};
}

/**
 * builds a top-down radial "blob" tile out of one or more overlapping
 * circles (a saguaro's crown plus its arm lobes, or a barrel's single
 * round body), each independently ring-banded from its own center so
 * ribs read as radiating outward - then optionally stamps a centered
 * flower on top.
 *
 * @param {{cx: number, cy: number, radius: number}[]} blobs - circles to union, each in its own local ring-space.
 * @param {{ringPalettes: [object[], object[]], pithColor: number[], seed: number}} green - shared rib palette/seed for every blob.
 * @param {{cx: number, cy: number, radius: number, seed: number, palette: object[]}|null} flower - centered bloom, or `null` for none.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildRadialBlobGrid(blobs, green, flower) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const x = gx + 0.5;
            const y = gy + 0.5;

            // find the nearest blob this cell falls inside, so overlapping lobes blend without seams
            let nearestDist = Infinity;
            for (const blob of blobs) {
                const dist = Math.hypot(x - blob.cx, y - blob.cy);
                if (dist <= blob.radius && dist < nearestDist) nearestDist = dist;
            }

            if (nearestDist !== Infinity) {
                if (nearestDist <= PITH_RADIUS) {
                    grid[gy * GRID + gx] = green.pithColor;
                } else {
                    const ringIndex = Math.floor(nearestDist / RING_WIDTH);
                    grid[gy * GRID + gx] = pickColor(green.ringPalettes[ringIndex % 2], green.seed, gx, gy);
                }
            }

            if (flower) {
                const flowerDist = Math.hypot(x - flower.cx, y - flower.cy);
                if (flowerDist <= flower.radius) {
                    grid[gy * GRID + gx] = pickColor(flower.palette, flower.seed, gx, gy);
                }
            }
        }
    }
    return grid;
}

/**
 * Saguaro crown: one main blob at the tile's center, plus optional arm
 * lobes - sized and offset so they clearly bulge past the crown's own
 * outline (not just barely poke out of an otherwise-circular silhouette),
 * while still overlapping it enough to read as fused to the same plant.
 * Arm variants reach further toward the tile's edge than the bare crown -
 * both a legibility win (fills most of the tile) and, conveniently, true to
 * how real saguaros grow: armless ones are younger and smaller.
 */
const SAGUARO_MAIN = { cx: CENTER, cy: CENTER, radius: 4.6 };
const SAGUARO_LEFT_ARM = { cx: CENTER - 3.8, cy: CENTER - 1.2, radius: 3.0 };
const SAGUARO_RIGHT_ARM = { cx: CENTER + 3.8, cy: CENTER - 1.2, radius: 3.0 };

/**
 * the blobs making up a saguaro's silhouette for a given arm
 * configuration - shared between color rendering and bounds, so a variant's
 * hitbox always matches what it actually draws.
 *
 * @param {{leftArm: boolean, rightArm: boolean}} options - which arms to include.
 * @returns {{cx: number, cy: number, radius: number}[]} the contributing blobs.
 */
function saguaroBlobs({ leftArm, rightArm }) {
    const blobs = [SAGUARO_MAIN];
    if (leftArm) blobs.push(SAGUARO_LEFT_ARM);
    if (rightArm) blobs.push(SAGUARO_RIGHT_ARM);
    return blobs;
}

/**
 * builds a saguaro tile: a ribbed round crown, zero/one/two overlapping arm
 * lobes, and an optional centered bloom.
 *
 * @param {{cx: number, cy: number, radius: number}[]} blobs - this variant's blobs - see {@link saguaroBlobs}.
 * @param {boolean} flowering - whether to stamp the centered bloom on top.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildSaguaroGrid(blobs, flowering) {
    const flower = flowering ? { ...SAGUARO_FLOWER, cx: SAGUARO_MAIN.cx, cy: SAGUARO_MAIN.cy } : null;
    return buildRadialBlobGrid(blobs, SAGUARO_GREEN, flower);
}

/** Barrel body: a single round blob, true-circular from above (unlike the saguaro's fused crown+arms) - every barrel variant shares this one footprint. */
const BARREL_BODY = { cx: CENTER, cy: CENTER, radius: 6.4 };
const BARREL_BLOBS = [BARREL_BODY];
const BARREL_FLOWER_RADIUS = 2.2;
const BARREL_BOUNDS = buildBounds(BARREL_BLOBS);

/**
 * builds a barrel-cactus tile: a ribbed round body, optionally topped with a centered flower.
 *
 * @param {{seed: number, palette: {color: number[], weight: number}[]}|null} flower - flower palette, or `null` for a plain barrel.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildBarrelGrid(flower) {
    const flowerSpec = flower
        ? { cx: BARREL_BODY.cx, cy: BARREL_BODY.cy, radius: BARREL_FLOWER_RADIUS, seed: flower.seed, palette: flower.palette }
        : null;
    return buildRadialBlobGrid(BARREL_BLOBS, BARREL_GREEN, flowerSpec);
}

/**
 * one saguaro tile row entry: builds both its color grid and its
 * arm-shaped collision bounds from the same blob set.
 *
 * @param {string} type - sprite type name.
 * @param {{leftArm: boolean, rightArm: boolean}} arms - which arms this variant has.
 * @param {boolean} flowering - whether this variant has the centered bloom.
 * @returns {{type: string, build: () => (number[]|null)[], bounds: {points: {x: number, y: number}[]}}} the tile row entry.
 */
function saguaroTile(type, arms, flowering) {
    const blobs = saguaroBlobs(arms);
    return { type, build: () => buildSaguaroGrid(blobs, flowering), bounds: buildBounds(blobs) };
}

// row 0: saguaro, unflowered (no arm, left arm, right arm, both arms)
// row 1: saguaro, flowering (same four arm configurations)
// row 2: barrel (plain, pink/yellow/white flower)
const TILE_ROWS = [
    [
        saguaroTile("saguaroNoArm", { leftArm: false, rightArm: false }, false),
        saguaroTile("saguaroArmLeft", { leftArm: true, rightArm: false }, false),
        saguaroTile("saguaroArmRight", { leftArm: false, rightArm: true }, false),
        saguaroTile("saguaroBothArms", { leftArm: true, rightArm: true }, false),
    ],
    [
        saguaroTile("saguaroNoArmFlower", { leftArm: false, rightArm: false }, true),
        saguaroTile("saguaroArmLeftFlower", { leftArm: true, rightArm: false }, true),
        saguaroTile("saguaroArmRightFlower", { leftArm: false, rightArm: true }, true),
        saguaroTile("saguaroBothArmsFlower", { leftArm: true, rightArm: true }, true),
    ],
    [
        { type: "barrelPlain", build: () => buildBarrelGrid(null), bounds: BARREL_BOUNDS },
        { type: "barrelFlowerPink", build: () => buildBarrelGrid(FLOWER_PALETTES.pink), bounds: BARREL_BOUNDS },
        { type: "barrelFlowerYellow", build: () => buildBarrelGrid(FLOWER_PALETTES.yellow), bounds: BARREL_BOUNDS },
        { type: "barrelFlowerWhite", build: () => buildBarrelGrid(FLOWER_PALETTES.white), bounds: BARREL_BOUNDS },
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
        interactable: true,
        bounds: tile.bounds,
    };
}));

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-cactus-sprites.mjs", "static/cactus-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("cactus tiles:", TILE_ROWS.map((row) => row.map((tile) => tile.type).join(", ")).join(" | "));
