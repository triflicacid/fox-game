import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";

const GRID = 16; // logical cells per tile edge - matches the ground tile grid, so structure tiles align 1:1 with it
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;

// Two center conventions coexist here, matched to how each shape is built:
// log-style grids (trees, large boulder pieces) mask from a grid-cell center at `(GRID - 1) / 2`,
// while radial-blob grids (small boulder stones) sample from cell centers against `GRID / 2` - see
// gen-cactus-sprites.mjs, which small stones otherwise mirror.
const LOG_CENTER = (GRID - 1) / 2;
const BLOB_CENTER = GRID / 2;

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
const RING_WIDTH = 2.2; // concentric tree-ring/rock banding, viewed from above
const PITH_RADIUS = 1.4;

/**
 * builds a top-down cut-log (or, for boulders, a full rock-slab) tile:
 * concentric ring bands (alternating palettes by ring parity) with a small
 * dark pith at the centre.
 *
 * Two shapes: `radius: null` fills the whole square tile edge-to-edge (a
 * tree's "square" log, or a large boulder's full-tile rock fill). A finite
 * `radius` masks it into a circle instead (a tree's "round" log); cells
 * outside that circle use `cornerLeaves`' palette/gap-chance rather than
 * staying transparent, so a diagonally adjacent leaf tile visually connects
 * into the trunk tile's corners instead of leaving a bare gap of ground
 * showing.
 *
 * @param {object} log - log/rock definition.
 * @param {number} log.seed - color seed.
 * @param {[{color: number[], weight: number}[], {color: number[], weight: number}[]]} log.ringPalettes - palettes used on even/odd rings.
 * @param {number[]} log.pithColor - rgba color for the centre pith.
 * @param {number|null} log.radius - trunk/rock radius, or `null` for a full square tile.
 * @param {{seed: number, palette: {color: number[], weight: number}[], gapChance: number}} [log.cornerLeaves] - texture for the area outside `radius`; only used when `radius` is finite.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildLogGrid({ seed, ringPalettes, pithColor, radius, cornerLeaves }) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const x = gx - LOG_CENTER;
            const y = gy - LOG_CENTER;
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
 * builds a leaf/branch tile: a weighted-palette texture covering the whole
 * tile (so adjacent tiles tessellate into one continuous canopy), with
 * random fully-transparent gaps so the ground/entities beneath show through.
 *
 * @param {object} leaves - leaf/branch definition.
 * @param {number} leaves.seed - color seed.
 * @param {{color: number[], weight: number}[]} leaves.palette - color palette.
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

/**
 * builds a "branches" tile: just a handful of distinct dead twigs radiating
 * out from the tile's centre, most with one short forked offshoot partway
 * along - deliberately sparse and line-like rather than a dense/symmetric
 * starburst, so it reads as a few sickly surviving branches rather than a
 * leaf-cloud silhouette, for a skeletal (dead) tree.
 *
 * @param {object} branches - branch definition.
 * @param {number} branches.seed - color/placement seed.
 * @param {{color: number[], weight: number}[]} branches.palette - color palette.
 * @param {number} branches.count - how many branches radiate out.
 * @param {number} branches.minLength - shortest branch length, in grid cells from centre.
 * @param {number} branches.maxLength - longest branch length, in grid cells from centre.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildSpikeGrid({ seed, palette, count, minLength, maxLength }) {
    const grid = new Array(GRID * GRID).fill(null);

    /**
     * plots one cell if it's within bounds.
     *
     * @param {number} gx - grid cell x.
     * @param {number} gy - grid cell y.
     * @returns {boolean} whether the cell was in bounds and plotted.
     */
    const plot = (gx, gy) => {
        if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return false;
        grid[gy * GRID + gx] = pickColor(palette, seed, gx, gy);
        return true;
    };

    for (let i = 0; i < count; i++) {
        // evenly spaced base angles, jittered so branches don't look mechanically regular
        const angle = (2 * Math.PI * i) / count + (hash(seed, i, 0) - 0.5) * 1.3;
        const length = minLength + hash(seed, i, 1) * (maxLength - minLength);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let step = 0.5; step <= length; step += 0.5) {
            if (!plot(Math.round(LOG_CENTER + dx * step), Math.round(LOG_CENTER + dy * step))) break;
        }

        // most branches get one short forked offshoot partway along, so each reads as a
        // branch with a twig rather than a bare straight line
        if (hash(seed, i, 2) < 0.7) {
            const forkStart = length * (0.35 + hash(seed, i, 3) * 0.25);
            const forkAngle = angle + (hash(seed, i, 4) < 0.5 ? -1 : 1) * (0.6 + hash(seed, i, 5) * 0.5);
            const forkLength = length * (0.3 + hash(seed, i, 6) * 0.25);
            const forkDx = Math.cos(forkAngle);
            const forkDy = Math.sin(forkAngle);
            const baseX = LOG_CENTER + dx * forkStart;
            const baseY = LOG_CENTER + dy * forkStart;
            for (let step = 0.5; step <= forkLength; step += 0.5) {
                if (!plot(Math.round(baseX + forkDx * step), Math.round(baseY + forkDy * step))) break;
            }
        }
    }
    return grid;
}

/**
 * layers two grids together, preferring `base`'s own cell wherever it's
 * painted and falling back to `overlay` only where `base` is transparent -
 * e.g. drawing a trunk's ring-banded core over a scatter of twig nubs
 * without either overwriting the other.
 *
 * @param {(number[]|null)[]} base - top layer; wins on any non-null cell.
 * @param {(number[]|null)[]} overlay - bottom layer, shown only where `base` is transparent.
 * @returns {(number[]|null)[]} the merged grid.
 */
function mergeGrids(base, overlay) {
    return base.map((color, i) => color ?? overlay[i]);
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

// ebony bark - near-black rather than brown, so a skeletal tree reads as dead/burnt at a glance
const SKELETAL_LOG = {
    seed: 8003,
    ringPalettes: [
        [
            { color: [46, 44, 42, 255], weight: 68 },
            { color: [30, 28, 26, 255], weight: 22 },
            { color: [62, 60, 56, 255], weight: 6 },
            { color: [86, 90, 92, 255], weight: 4 }, // faint frost/lichen fleck
        ],
        [
            { color: [38, 36, 34, 255], weight: 68 },
            { color: [24, 22, 20, 255], weight: 22 },
            { color: [54, 52, 48, 255], weight: 6 },
            { color: [86, 90, 92, 255], weight: 4 },
        ],
    ],
    pithColor: [18, 17, 16, 255],
};

/**
 * Much narrower than {@link LOG_RADIUS} (a live trunk's own mask radius) -
 * a skeletal tree's trunk should read as a bare stick, not a log, with most
 * of its tile left transparent around it.
 */
const SKELETAL_TRUNK_RADIUS = 1.7;

// shared ebony palette for every stick-like bit of a skeletal tree that isn't the trunk's own
// ring-banded core - trunk-tile twig nubs and the dedicated branches tile alike. No leaf/gap
// texture anywhere on a dead tree - see buildSpikeGrid, which every one of these draws with.
const SKELETAL_BRANCH_PALETTE = [
    { color: [46, 44, 42, 255], weight: 60 },
    { color: [30, 28, 26, 255], weight: 26 },
    { color: [62, 60, 56, 255], weight: 10 },
    { color: [86, 90, 92, 255], weight: 4 }, // faint frost/lichen fleck
];

// a couple of short twig nubs breaking free of the trunk mask on its own tile - distinct
// (shorter, fewer) from the dedicated branches tile below, which carries the bulk of the silhouette
const SKELETAL_TRUNK_TWIGS = {
    seed: 8004,
    count: 3,
    minLength: 1.5,
    maxLength: 4,
    palette: SKELETAL_BRANCH_PALETTE,
};

// deliberately darker and more saturated than every forest-floor variant (see
// FOREST_VARIANTS in gen-background-tile-sprites.mjs) so oak canopy reads as shadowed
// foliage above the ground rather than blending into it
const OAK_LEAVES = {
    seed: 7001,
    gapChance: 0.12,
    palette: [
        { color: [24, 52, 20, 255], weight: 60 },
        { color: [16, 38, 14, 255], weight: 20 },
        { color: [34, 68, 28, 255], weight: 16 },
        { color: [44, 80, 34, 255], weight: 4 },
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

// no foliage left, just a few bare ebony branches (see buildSpikeGrid) - same palette as
// SKELETAL_TRUNK_TWIGS, just longer/more of them, since this tile carries the bulk of the tree's silhouette
const SKELETAL_BRANCHES = {
    seed: 7003,
    count: 4,
    minLength: 4,
    maxLength: 7,
    palette: SKELETAL_BRANCH_PALETTE,
};

// row 0: oak (square log, round log, leaves); row 1: birch (square log, round log, leaves) -
// both multi-tile, `tree.<family>.<role>`-namespaced: a trunk anchor piece plus a separate
// leaf piece stamped across several surrounding tiles by their manifest (see tree-structures.json).
const TREE_ROWS = [
    [
        { type: "tree.oak.log_square", build: () => buildLogGrid({ ...OAK_LOG, radius: null }) },
        { type: "tree.oak.log_round", build: () => buildLogGrid({ ...OAK_LOG, radius: LOG_RADIUS, cornerLeaves: OAK_LEAVES }) },
        { type: "tree.oak.leaves", build: () => buildLeafGrid(OAK_LEAVES) },
    ],
    [
        { type: "tree.birch.log_square", build: () => buildLogGrid({ ...BIRCH_LOG, radius: null }) },
        { type: "tree.birch.log_round", build: () => buildLogGrid({ ...BIRCH_LOG, radius: LOG_RADIUS, cornerLeaves: BIRCH_LEAVES }) },
        { type: "tree.birch.leaves", build: () => buildLeafGrid(BIRCH_LEAVES) },
    ],
];

// A skeletal (dead) tree is a single-tile, standalone sprite.
const SKELETAL_TREE_ROWS = [
    [
        { type: "skeletal_tree.1", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS + 0.4 }),
            buildSpikeGrid(SKELETAL_TRUNK_TWIGS),
        ) },
        { type: "skeletal_tree.2", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS }),
            buildSpikeGrid({ ...SKELETAL_TRUNK_TWIGS, seed: SKELETAL_TRUNK_TWIGS.seed + 1 }),
        ) },
        // a fuller-branched variant, not a separate companion piece - still its own trunk,
        // like the other two, just paired with the longer/more numerous SKELETAL_BRANCHES set
        { type: "skeletal_tree.3", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS }),
            buildSpikeGrid(SKELETAL_BRANCHES),
        ) },
    ],
];

// --- boulders --------------------------------------------------------------
//
// "Small" stones render sub-tile, exactly like CactusStructure's plants: one
// or more overlapping circular blobs, ring-banded from their own centre, with
// a tight convex-hull collision polygon computed from the same blobs (see
// gen-cactus-sprites.mjs, which this mirrors).
//
// "Large"/"huge" boulders are multi-tile instead: a single big circle shared
// across a 2x2 or 3x3 block of tiles (see `buildBoulderPieceGrid`), sliced
// into one piece per tile position so the composite's own outer corners come
// out rounded/circular rather than a square block of rock tiles butted
// together - each piece is still a full, edge-to-edge tile image; the
// roundedness comes from the shared circle each piece samples its own slice
// of, not from any transparency baked into a single tile alone.

/** cold granite-grey, for small stones and the 2x2 "large" boulder. */
const ROCK_STONE = {
    seed: 9301,
    ringPalettes: [
        [
            { color: [142, 148, 154, 255], weight: 68 },
            { color: [118, 124, 130, 255], weight: 20 },
            { color: [162, 168, 174, 255], weight: 8 },
            { color: [96, 102, 108, 255], weight: 4 }, // crack fleck
        ],
        [
            { color: [130, 136, 142, 255], weight: 68 },
            { color: [106, 112, 118, 255], weight: 20 },
            { color: [150, 156, 162, 255], weight: 8 },
            { color: [88, 94, 100, 255], weight: 4 },
        ],
    ],
    pithColor: [92, 98, 104, 255],
};

/** darker, more weathered tone than {@link ROCK_STONE}, so the 3x3 "huge" boulder reads as a distinct rock mass rather than just a bigger copy of "large". */
const ROCK_WEATHERED = {
    seed: 9311,
    ringPalettes: [
        [
            { color: [124, 130, 136, 255], weight: 66 },
            { color: [100, 106, 112, 255], weight: 22 },
            { color: [146, 152, 158, 255], weight: 8 },
            { color: [76, 82, 88, 255], weight: 4 },
        ],
        [
            { color: [112, 118, 124, 255], weight: 66 },
            { color: [90, 96, 102, 255], weight: 22 },
            { color: [134, 140, 146, 255], weight: 8 },
            { color: [70, 76, 82, 255], weight: 4 },
        ],
    ],
    pithColor: [80, 86, 92, 255],
};

const ROCK_RING_WIDTH = 1.15; // finer than a log's own RING_WIDTH - stones are much smaller than a trunk
const ROCK_PITH_RADIUS = 0.9;

/** points sampled around each blob's circumference before hulling - see {@link buildBounds}. */
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
 * result. Kept tight to the stone's actual silhouette rather than the whole
 * tile, since these sprites render sub-tile - see `SpriteBounds`.
 *
 * @param {{cx: number, cy: number, radius: number}[]} blobs - circles to enclose, in the same cell-unit space the color geometry uses.
 * @returns {{points: {x: number, y: number}[]}} the collision bounds.
 */
function buildBounds(blobs) {
    const samples = [];
    for (const blob of blobs) {
        const pxCx = (blob.cx - BLOB_CENTER) * BLOCK;
        const pxCy = (blob.cy - BLOB_CENTER) * BLOCK;
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
 * circles, each ring-banded from its own centre so bands read as radiating
 * outward once viewed from above - same trick as {@link buildLogGrid}'s
 * rings, just centred per-blob instead of on the tile.
 *
 * @param {{cx: number, cy: number, radius: number}[]} blobs - circles to union, each in its own local ring-space.
 * @param {{ringPalettes: [object[], object[]], pithColor: number[], seed: number}} rock - shared rock palette/seed for every blob.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildRockBlobGrid(blobs, rock) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const x = gx + 0.5;
            const y = gy + 0.5;

            let nearestDist = Infinity;
            for (const blob of blobs) {
                const dist = Math.hypot(x - blob.cx, y - blob.cy);
                if (dist <= blob.radius && dist < nearestDist) nearestDist = dist;
            }

            if (nearestDist !== Infinity) {
                if (nearestDist <= ROCK_PITH_RADIUS) {
                    grid[gy * GRID + gx] = rock.pithColor;
                } else {
                    const ringIndex = Math.floor(nearestDist / ROCK_RING_WIDTH);
                    grid[gy * GRID + gx] = pickColor(rock.ringPalettes[ringIndex % 2], rock.seed, gx, gy);
                }
            }
        }
    }
    return grid;
}

/**
 * builds one tile-sized piece of a larger, multi-tile circular boulder. The
 * composite boulder is one big circle laid out in a shared
 * `tilesPerEdge x tilesPerEdge`-tile grid space (`GRID` cells per tile);
 * this renders only the slice of that circle falling within one particular
 * tile position, so stamping every position's piece edge-to-edge reproduces
 * a single seamless boulder whose outer silhouette is rounded, not the
 * square bounding box the tiles themselves are.
 *
 * @param {{ringPalettes: [object[], object[]], pithColor: number[], seed: number}} rock - shared rock palette/seed for the whole composite.
 * @param {number} tilesPerEdge - how many tiles wide/tall the composite boulder spans (e.g. `2` or `3`).
 * @param {number} pieceCol - this piece's column within the composite, `0`-indexed.
 * @param {number} pieceRow - this piece's row within the composite, `0`-indexed.
 * @returns {(number[]|null)[]} this piece's tile colors in row-major order.
 */
function buildBoulderPieceGrid(rock, tilesPerEdge, pieceCol, pieceRow) {
    const compositeSize = tilesPerEdge * GRID;
    const compositeCenter = compositeSize / 2;
    const radius = compositeCenter - 1.5; // small transparent margin so the circle doesn't touch the composite's own bounding box

    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const compositeX = pieceCol * GRID + gx + 0.5;
            const compositeY = pieceRow * GRID + gy + 0.5;
            const dist = Math.hypot(compositeX - compositeCenter, compositeY - compositeCenter);
            if (dist > radius) continue;

            if (dist <= ROCK_PITH_RADIUS * 1.6) { // a wider pith than a single stone's own - reads as one shared highlight at the boulder's centre
                grid[gy * GRID + gx] = rock.pithColor;
                continue;
            }
            const ringIndex = Math.floor(dist / ROCK_RING_WIDTH);
            // hashed on composite-space coordinates, not local ones, so texture doesn't repeat/mirror between pieces
            grid[gy * GRID + gx] = pickColor(rock.ringPalettes[ringIndex % 2], rock.seed, compositeX, compositeY);
        }
    }
    return grid;
}

// same packed-snow tone as the ground tundra tiles (see gen-background-tile-sprites.mjs's
// TUNDRA_BARREN_MEDIUM), so a snow-capped boulder reads as covered in the same stuff the
// ground is
const SNOW_CAP = {
    seed: 9331,
    centerCoverage: 0.95, // near-solid at the boulder's own crown
    rimCoverage: 0.3,     // patchy, rock-peeking-through at the rounded rim
    palette: [
        { color: [232, 236, 238, 255], weight: 55 },
        { color: [210, 216, 220, 255], weight: 22 },
        { color: [248, 250, 250, 255], weight: 16 },
        { color: [186, 196, 204, 255], weight: 7 }, // cold shadow fleck
    ],
};

/**
 * builds one tile-sized piece of a boulder's optional snow cap - a partial
 * overlay meant to be drawn on top of the matching {@link buildBoulderPieceGrid}
 * piece, not a replacement for it (see `SNOW_CAP`'s caller, which keeps this
 * a separate sprite type from the boulder itself). Reuses the same composite
 * circle geometry so the cap's edge follows the boulder's own rounded
 * silhouette. These are top-down sprites - there's no "north side" of a
 * boulder to favour - so coverage is radial instead of directional: solid
 * near the composite's own centre (its flattest, most snow-catching point as
 * seen from directly above) and thinning to patchy near the rounded rim
 * (where the surface curves away steeply and less snow clings), with every
 * cell's own coverage independently rolled rather than a hard radius cutoff,
 * so the edge reads as drifted/uneven rather than a precise ring.
 *
 * @param {{seed: number, palette: {color: number[], weight: number}[], centerCoverage: number, rimCoverage: number}} snow - shared snow palette/seed/coverage falloff.
 * @param {number} tilesPerEdge - how many tiles wide/tall the composite boulder spans (e.g. `2` or `3`).
 * @param {number} pieceCol - this piece's column within the composite, `0`-indexed.
 * @param {number} pieceRow - this piece's row within the composite, `0`-indexed.
 * @returns {(number[]|null)[]} this piece's tile colors in row-major order.
 */
function buildBoulderSnowPieceGrid(snow, tilesPerEdge, pieceCol, pieceRow) {
    const compositeSize = tilesPerEdge * GRID;
    const compositeCenter = compositeSize / 2;
    const radius = compositeCenter - 1.5; // matches buildBoulderPieceGrid's own margin, so the cap never pokes past the rock

    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const compositeX = pieceCol * GRID + gx + 0.5;
            const compositeY = pieceRow * GRID + gy + 0.5;
            const dist = Math.hypot(compositeX - compositeCenter, compositeY - compositeCenter);
            if (dist > radius) continue; // never spill past the boulder's own silhouette

            const rimness = dist / radius; // 0 at the centre, 1 at the very rim
            const coverageChance = snow.centerCoverage - rimness * (snow.centerCoverage - snow.rimCoverage);
            if (hash(snow.seed + GAP_SEED_OFFSET, compositeX, compositeY) >= coverageChance) continue; // bare rock shows through here

            grid[gy * GRID + gx] = pickColor(snow.palette, snow.seed, compositeX, compositeY);
        }
    }
    return grid;
}

/**
 * one composite boulder's full set of snow-cap piece row entries - every
 * position gets one, not just a subset: a top-down sprite has no "north
 * side" to single out, so the whole visible surface can carry snow (see
 * {@link buildBoulderSnowPieceGrid}'s radial coverage). Mirrors
 * {@link boulderPieceRows}'s own row layout exactly, so a piece's snow
 * overlay always lines up with its rock piece.
 *
 * @param {string} family - sprite type family, matching the base boulder's own (`"large"`/`"huge"`).
 * @param {number} tilesPerEdge - how many tiles wide/tall the composite boulder spans.
 * @param {string[][]} compassGrid - row-major compass-direction names for every piece position - see {@link COMPASS_2}/{@link COMPASS_3}.
 * @returns {{type: string, build: () => (number[]|null)[]}[][]} one array of snow-cap tile row entries per row of `compassGrid`.
 */
function boulderSnowCapRows(family, tilesPerEdge, compassGrid) {
    return compassGrid.map((row, pieceRow) => row.map((name, pieceCol) => ({
        type: `boulder.${family}.snow.${name}`,
        build: () => buildBoulderSnowPieceGrid(SNOW_CAP, tilesPerEdge, pieceCol, pieceRow),
    })));
}

/**
 * one composite boulder's full set of piece row entries, one row per grid
 * row so it slots directly into {@link TILE_ROWS}.
 *
 * @param {string} family - sprite type family, e.g. `"large"`/`"huge"`.
 * @param {{ringPalettes: [object[], object[]], pithColor: number[], seed: number}} rock - shared rock palette/seed for the whole composite.
 * @param {string[][]} compassGrid - row-major compass-direction names (e.g. `"nw"`/`"n"`/`"center"`) for every piece position - see {@link COMPASS_2}/{@link COMPASS_3}.
 * @returns {{type: string, build: () => (number[]|null)[]}[][]} one array of tile row entries per row of `compassGrid`.
 */
function boulderPieceRows(family, rock, compassGrid) {
    const tilesPerEdge = compassGrid.length;
    return compassGrid.map((row, pieceRow) => row.map((name, pieceCol) => ({
        type: `boulder.${family}.${name}`,
        build: () => buildBoulderPieceGrid(rock, tilesPerEdge, pieceCol, pieceRow),
    })));
}

/** compass-direction piece names for a 2x2 composite boulder - only corners exist at this size. */
const COMPASS_2 = [
    ["nw", "ne"],
    ["sw", "se"],
];

/** compass-direction piece names for a 3x3 composite boulder - corners, edge midpoints, and a centre. */
const COMPASS_3 = [
    ["nw", "n", "ne"],
    ["w", "center", "e"],
    ["sw", "s", "se"],
];

/**
 * one small-stone tile row entry: builds both its color grid and its
 * blob-shaped collision bounds from the same blob set - mirrors
 * gen-cactus-sprites.mjs's `saguaroTile`/`barrelTile` pattern.
 *
 * @param {string} type - sprite type name.
 * @param {{cx: number, cy: number, radius: number}[]} blobs - this variant's blobs.
 * @returns {{type: string, build: () => (number[]|null)[], bounds: {points: {x: number, y: number}[]}}} the tile row entry.
 */
function stoneTile(type, blobs) {
    return { type, build: () => buildRockBlobGrid(blobs, ROCK_STONE), bounds: buildBounds(blobs) };
}

// three within-one-tile stone variants, by blob count - a single pebble, a
// small pair, and a loose three-stone scatter - all comfortably inside the
// tile's edges like a cactus's own sub-tile footprint
const STONE_SOLO = [{ cx: BLOB_CENTER, cy: BLOB_CENTER, radius: 4.2 }];
const STONE_PAIR = [
    { cx: BLOB_CENTER - 1.6, cy: BLOB_CENTER + 0.6, radius: 3.4 },
    { cx: BLOB_CENTER + 2.4, cy: BLOB_CENTER - 1.2, radius: 2.2 },
];
const STONE_CLUSTER = [
    { cx: BLOB_CENTER - 2.0, cy: BLOB_CENTER + 1.0, radius: 2.8 },
    { cx: BLOB_CENTER + 1.8, cy: BLOB_CENTER + 0.4, radius: 2.6 },
    { cx: BLOB_CENTER - 0.2, cy: BLOB_CENTER - 2.2, radius: 2.0 },
];

// row 0: small, single-tile sub-tile stones (solo, pair, cluster)
// rows 1-2: "large" - a 2x2 rounded composite boulder (4 corner pieces, no edges/centre at this size)
// rows 3-5: "huge" - a 3x3 rounded composite boulder (4 corners, 4 edge midpoints, 1 centre)
// rows 6-8: optional snow caps for "large"/"huge", one full compass grid each (every
// position, not just a subset - see boulderSnowCapRows) - separate sprites, layered over the
// matching rock piece rather than baked into it, so a boulder can spawn with or without snow
const BOULDER_ROWS = [
    [
        stoneTile("boulder.small.solo", STONE_SOLO),
        stoneTile("boulder.small.pair", STONE_PAIR),
        stoneTile("boulder.small.cluster", STONE_CLUSTER),
    ],
    ...boulderPieceRows("large", ROCK_STONE, COMPASS_2),
    ...boulderPieceRows("huge", ROCK_WEATHERED, COMPASS_3),
    ...boulderSnowCapRows("large", 2, COMPASS_2),
    ...boulderSnowCapRows("huge", 3, COMPASS_3),
];

const TILE_ROWS = [...TREE_ROWS, ...SKELETAL_TREE_ROWS, ...BOULDER_ROWS];

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
        interactable: Boolean(tile.bounds), // decorative props (trees) aren't; collidable stones are, like cacti
        ...(tile.bounds ? { bounds: tile.bounds } : {}),
    };
}));

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-structure-sprites.mjs", "static/structure-sprites.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("structure tiles:", TILE_ROWS.map((row) => row.map((tile) => tile.type).join(", ")).join(" | "));
