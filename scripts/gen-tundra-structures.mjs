import { blitGrid, parseCliArgs, writeSpriteSheet } from "./lib/sprite-sheet.mjs";
import { convexHull } from "./lib/convex-hull.mjs";

const GRID = 16; // logical cells per tile edge - matches the ground tile grid, so tundra tiles align 1:1 with it
const BLOCK = 2; // real pixels per grid cell -> 32x32 per tile
const CELL_PX = GRID * BLOCK;

// Two center conventions coexist here, matched to how each shape is built:
// log-style grids (skeletal trunks, large boulder pieces) mask from a grid-cell center at
// `(GRID - 1) / 2`, while radial-blob grids (small boulder stones) sample from cell centers
// against `GRID / 2` - see gen-desert-structures.mjs, which small stones otherwise mirror, and
// gen-forest-structures.mjs, which shares the log-style convention for its own trunks.
const LOG_CENTER = (GRID - 1) / 2;
const BLOB_CENTER = GRID / 2;

/** points sampled around each blob's circumference before hulling - see {@link buildBounds}. */
const BOUNDS_SAMPLES = 10;

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

const RING_WIDTH = 2.2; // concentric tree-ring/rock banding, viewed from above
const PITH_RADIUS = 1.4;

/**
 * builds a top-down cut-log tile: concentric ring bands (alternating
 * palettes by ring parity) with a small dark pith at the centre.
 *
 * `radius: null` fills the whole square tile edge-to-edge; a finite `radius`
 * masks it into a circle instead, leaving cells outside it transparent (no
 * `cornerLeaves` texture here - a dead tree has no foliage to connect into,
 * unlike gen-forest-structures.mjs's live trunks).
 *
 * @param {object} log - log definition.
 * @param {number} log.seed - color seed.
 * @param {[{color: number[], weight: number}[], {color: number[], weight: number}[]]} log.ringPalettes - palettes used on even/odd rings.
 * @param {number[]} log.pithColor - rgba color for the centre pith.
 * @param {number|null} log.radius - trunk radius, or `null` for a full square tile.
 * @returns {(number[]|null)[]} the tile's colors in row-major order.
 */
function buildLogGrid({ seed, ringPalettes, pithColor, radius }) {
    const grid = new Array(GRID * GRID).fill(null);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const x = gx - LOG_CENTER;
            const y = gy - LOG_CENTER;
            const dist = Math.sqrt(x * x + y * y);

            if (radius !== null && dist > radius) continue;

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
function buildSpikeGrid({ seed, palette, count, minLength, maxLength, thickness = 1 }) {
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
        // sideways nudge added alongside the main stroke to bulk a hairline branch into a
        // visibly bold one - forks stay thin, so the main limbs still read as the thicker ones
        const perpDx = -dy * 0.6;
        const perpDy = dx * 0.6;
        for (let step = 0.5; step <= length; step += 0.5) {
            const x = LOG_CENTER + dx * step;
            const y = LOG_CENTER + dy * step;
            if (!plot(Math.round(x), Math.round(y))) break;
            if (thickness > 1) plot(Math.round(x + perpDx), Math.round(y + perpDy));
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
 * Narrower than a live trunk's own mask radius (see gen-forest-structures.mjs's LOG_RADIUS) - a
 * skeletal tree's trunk should still read as a bare stick, not a log - but big enough that the
 * tile doesn't look undersized next to a live trunk.
 */
const SKELETAL_TRUNK_RADIUS = 3.5;

// shared ebony palette for every stick-like bit of a skeletal tree that isn't the trunk's own
// ring-banded core - trunk-tile twig nubs and the dedicated branches tile alike. No leaf/gap
// texture anywhere on a dead tree - see buildSpikeGrid, which every one of these draws with.
const SKELETAL_BRANCH_PALETTE = [
    { color: [46, 44, 42, 255], weight: 60 },
    { color: [30, 28, 26, 255], weight: 26 },
    { color: [62, 60, 56, 255], weight: 10 },
    { color: [86, 90, 92, 255], weight: 4 }, // faint frost/lichen fleck
];

// a handful of twig nubs breaking free of the trunk mask on its own tile - distinct
// (shorter, fewer) from the dedicated branches tile below, which carries the bulk of the silhouette.
const SKELETAL_TRUNK_TWIGS = {
    seed: 8004,
    count: 4,
    minLength: 4.5,
    maxLength: 6.5,
    palette: SKELETAL_BRANCH_PALETTE,
    thickness: 2,
};

// no foliage left, just a few bare ebony branches (see buildSpikeGrid) - same palette as
// SKELETAL_TRUNK_TWIGS, just longer/more of them, since this tile carries the bulk of the tree's silhouette
const SKELETAL_BRANCHES = {
    seed: 7003,
    count: 6,
    minLength: 5.5,
    maxLength: 7.5,
    palette: SKELETAL_BRANCH_PALETTE,
    thickness: 2,
};

// A skeletal tree's collision hull is just its trunk circle - the twig/branch spikes layered on
// top (buildSpikeGrid) are thin enough that hulling them in would balloon the hitbox out to
// nearly the whole tile, undoing the point of authoring a tight hull at all; a fox brushing past
// a bare branch tip not "colliding" reads fine, the same way it doesn't for a saguaro's spines.
const SKELETAL_TRUNK_BOUNDS = buildBounds([{ cx: BLOB_CENTER, cy: BLOB_CENTER, radius: SKELETAL_TRUNK_RADIUS }]);
const SKELETAL_TRUNK_BOUNDS_WIDE = buildBounds([{ cx: BLOB_CENTER, cy: BLOB_CENTER, radius: SKELETAL_TRUNK_RADIUS + 0.4 }]);

// A skeletal (dead) tree is a single-tile, standalone sprite.
const SKELETAL_TREE_ROWS = [
    [
        { type: "skeletal_tree.1", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS + 0.4 }),
            buildSpikeGrid(SKELETAL_TRUNK_TWIGS),
        ), bounds: SKELETAL_TRUNK_BOUNDS_WIDE },
        { type: "skeletal_tree.2", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS }),
            buildSpikeGrid({ ...SKELETAL_TRUNK_TWIGS, seed: SKELETAL_TRUNK_TWIGS.seed + 1 }),
        ), bounds: SKELETAL_TRUNK_BOUNDS },
        // a fuller-branched variant, not a separate companion piece - still its own trunk,
        // like the other two, just paired with the longer/more numerous SKELETAL_BRANCHES set
        { type: "skeletal_tree.3", build: () => mergeGrids(
            buildLogGrid({ ...SKELETAL_LOG, radius: SKELETAL_TRUNK_RADIUS }),
            buildSpikeGrid(SKELETAL_BRANCHES),
        ), bounds: SKELETAL_TRUNK_BOUNDS },
    ],
];

// --- boulders --------------------------------------------------------------
//
// "Small" stones render sub-tile, exactly like CactusStructure's plants: one
// or more overlapping circular blobs, ring-banded from their own centre, with
// a tight convex-hull collision polygon computed from the same blobs (see
// gen-desert-structures.mjs, which this mirrors).
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
 * a composite boulder's shared circle geometry, in the same
 * `tilesPerEdge x tilesPerEdge`-tile grid space every per-piece builder
 * below samples from - factored out so the rock/snow grids and the
 * collision bounds (see {@link buildBoulderPieceBounds}) all draw the exact
 * same circle rather than three separately-tuned approximations of it.
 *
 * @param {number} tilesPerEdge - how many tiles wide/tall the composite boulder spans (e.g. `2` or `3`).
 * @returns {{compositeCenter: number, radius: number}} the shared circle's centre (on both axes) and radius, in grid cells.
 */
function boulderCompositeGeometry(tilesPerEdge) {
    const compositeSize = tilesPerEdge * GRID;
    const compositeCenter = compositeSize / 2;
    const radius = compositeCenter - 1.5; // small transparent margin so the circle doesn't touch the composite's own bounding box
    return { compositeCenter, radius };
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
    const { compositeCenter, radius } = boulderCompositeGeometry(tilesPerEdge);

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
    const { compositeCenter, radius } = boulderCompositeGeometry(tilesPerEdge);

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

/** points sampled around the shared composite circle before clipping - see {@link buildBoulderPieceBounds}. */
const BOULDER_CIRCLE_SAMPLES = 48;

/**
 * clips convex polygon `subject` against the axis-aligned rectangle
 * `[minX, maxX] x [minY, maxY]`, via the
 * {@link https://en.wikipedia.org/wiki/Sutherland%E2%80%93Hodgman_algorithm | Sutherland-Hodgman algorithm}:
 * `subject` is walked once per rectangle edge, each pass keeping only the
 * portion on that edge's inside, adding a fresh vertex wherever the polygon
 * boundary crosses it. Both inputs being convex guarantees the result is
 * too - a circle clipped by a piece's own tile square is exactly the
 * boulder's collision hull for that piece (see {@link buildBoulderPieceBounds}).
 *
 * @param {{x: number, y: number}[]} subject - the polygon to clip, in the same space as the rectangle.
 * @param {number} minX - rectangle's left edge.
 * @param {number} minY - rectangle's top edge.
 * @param {number} maxX - rectangle's right edge.
 * @param {number} maxY - rectangle's bottom edge.
 * @returns {{x: number, y: number}[]} the clipped polygon's vertices.
 */
function clipPolygonToRect(subject, minX, minY, maxX, maxY) {
    const edges = [
        { inside: (p) => p.x >= minX, cross: (a, b) => ({ x: minX, y: a.y + (minX - a.x) / (b.x - a.x) * (b.y - a.y) }) },
        { inside: (p) => p.x <= maxX, cross: (a, b) => ({ x: maxX, y: a.y + (maxX - a.x) / (b.x - a.x) * (b.y - a.y) }) },
        { inside: (p) => p.y >= minY, cross: (a, b) => ({ y: minY, x: a.x + (minY - a.y) / (b.y - a.y) * (b.x - a.x) }) },
        { inside: (p) => p.y <= maxY, cross: (a, b) => ({ y: maxY, x: a.x + (maxY - a.y) / (b.y - a.y) * (b.x - a.x) }) },
    ];

    let output = subject;
    for (const edge of edges) {
        const input = output;
        output = [];
        for (let i = 0; i < input.length; i++) {
            const current = input[i];
            const previous = input[(i - 1 + input.length) % input.length];
            const currentInside = edge.inside(current);
            if (edge.inside(previous) !== currentInside) output.push(edge.cross(previous, current));
            if (currentInside) output.push(current);
        }
    }
    return output;
}

/**
 * builds one boulder piece's collision hull: the shared composite circle
 * (see {@link boulderCompositeGeometry}), clipped down to just the slice
 * falling within this piece's own tile - a rounded corner for a piece
 * sitting at the composite's rim, or the plain tile square for one (e.g. a
 * "huge" boulder's `center` piece) entirely inside the circle, since
 * clipping a convex shape by a rectangle wholly contained in it just
 * returns that rectangle. Mirrors {@link buildBoulderPieceGrid}'s own
 * per-piece slicing, but on the collision hull instead of the color grid.
 *
 * @param {number} tilesPerEdge - how many tiles wide/tall the composite boulder spans (e.g. `2` or `3`).
 * @param {number} pieceCol - this piece's column within the composite, `0`-indexed.
 * @param {number} pieceRow - this piece's row within the composite, `0`-indexed.
 * @returns {{points: {x: number, y: number}[]}} the collision bounds, in pixels relative to this piece's own tile centre.
 */
function buildBoulderPieceBounds(tilesPerEdge, pieceCol, pieceRow) {
    const { compositeCenter, radius } = boulderCompositeGeometry(tilesPerEdge);

    const circle = [];
    for (let k = 0; k < BOULDER_CIRCLE_SAMPLES; k++) {
        const angle = (2 * Math.PI * k) / BOULDER_CIRCLE_SAMPLES;
        circle.push({
            x: compositeCenter + radius * Math.cos(angle),
            y: compositeCenter + radius * Math.sin(angle),
        });
    }

    const minX = pieceCol * GRID;
    const minY = pieceRow * GRID;
    const clipped = clipPolygonToRect(circle, minX, minY, minX + GRID, minY + GRID);

    const pieceCenterX = minX + GRID / 2;
    const pieceCenterY = minY + GRID / 2;
    const rounded = clipped.map((p) => ({
        x: Math.round((p.x - pieceCenterX) * BLOCK),
        y: Math.round((p.y - pieceCenterY) * BLOCK),
    }));
    // rounding to whole pixels can collapse two distinct clipped vertices onto the same point
    // (e.g. a circle-sample point landing right next to a rect corner) - drop the resulting
    // zero-length edge rather than leaving it in for SAT to shrug off at runtime.
    const deduped = rounded.filter((p, i) => {
        const prev = rounded[(i - 1 + rounded.length) % rounded.length];
        return p.x !== prev.x || p.y !== prev.y;
    });
    return { points: deduped };
}

/**
 * one composite boulder's full set of piece row entries, one row per grid
 * row so it slots directly into {@link TILE_ROWS}. Each row holds the rock
 * composite's own pieces first (contiguous, so the shape still reads as one
 * whole circle at a glance), then that same row's snow-cap pieces
 * immediately after (see {@link buildBoulderSnowPieceGrid}) - two whole
 * composites side by side on the same rows, rather than either interleaved
 * piece-by-piece (which would chop each composite's own silhouette apart in
 * the sheet) or pushed down into separate rows further below (which is what
 * made the sheet needlessly tall).
 *
 * @param {string} family - sprite type family, e.g. `"large"`/`"huge"`.
 * @param {{ringPalettes: [object[], object[]], pithColor: number[], seed: number}} rock - shared rock palette/seed for the whole composite.
 * @param {string[][]} compassGrid - row-major compass-direction names (e.g. `"nw"`/`"n"`/`"center"`) for every piece position - see {@link COMPASS_2}/{@link COMPASS_3}.
 * @returns {{type: string, build: () => (number[]|null)[], bounds?: {points: {x: number, y: number}[]}}[][]} one array of tile row entries per row of `compassGrid`, twice as wide as `compassGrid` itself (the rock composite followed by the snow composite).
 */
function boulderPieceRows(family, rock, compassGrid) {
    const tilesPerEdge = compassGrid.length;
    return compassGrid.map((row, pieceRow) => [
        ...row.map((name, pieceCol) => ({
            type: `boulder.${family}.${name}`,
            build: () => buildBoulderPieceGrid(rock, tilesPerEdge, pieceCol, pieceRow),
            // only the rock piece needs a hull - its paired snow-cap piece (below) shares its
            // footprint and is never itself piece.sprites[0] (see World.structurePiecePolygon)
            bounds: buildBoulderPieceBounds(tilesPerEdge, pieceCol, pieceRow),
        })),
        ...row.map((name, pieceCol) => ({
            type: `boulder.${family}.snow.${name}`,
            build: () => buildBoulderSnowPieceGrid(SNOW_CAP, tilesPerEdge, pieceCol, pieceRow),
        })),
    ]);
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
 * gen-desert-structures.mjs's `saguaroTile`/`barrelTile` pattern.
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
// rows 1-2: "large" - a 2x2 rounded composite boulder (4 corner pieces, no edges/centre at
// this size), each rock piece paired with its own snow-cap piece right next to it
// rows 3-5: "huge" - a 3x3 rounded composite boulder (4 corners, 4 edge midpoints, 1 centre),
// same rock+snow pairing per position - see boulderPieceRows
const BOULDER_ROWS = [
    [
        stoneTile("boulder.small.solo", STONE_SOLO),
        stoneTile("boulder.small.pair", STONE_PAIR),
        stoneTile("boulder.small.cluster", STONE_CLUSTER),
    ],
    ...boulderPieceRows("large", ROCK_STONE, COMPASS_2),
    ...boulderPieceRows("huge", ROCK_WEATHERED, COMPASS_3),
];

const TILE_ROWS = [...SKELETAL_TREE_ROWS, ...BOULDER_ROWS];

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
        interactable: Boolean(tile.bounds), // skeletal trees/stones are; a snow-cap overlay isn't
        ...(tile.bounds ? { bounds: tile.bounds } : {}),
    };
}));

const descriptor = {
    cellWidth: CELL_PX,
    cellHeight: CELL_PX,
    rows: rowDescriptors,
};

const { outPath, descriptorOutPath } = parseCliArgs("gen-tundra-structures.mjs", "static/tundra-structures.json");
writeSpriteSheet(outPath, descriptorOutPath, sheetW, sheetH, sheet, descriptor);
console.log("tundra structure tiles:", TILE_ROWS.map((row) => row.map((tile) => tile.type).join(", ")).join(" | "));
