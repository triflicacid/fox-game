// logical grid and sheet cell sizing
const GRID = 24;
const CENTER = (GRID - 1) / 2;
const BLOCK = 5; // real pixels per grid cell -> 120x120 per frame
const CELL_PX = GRID * BLOCK;

// frames per animation row
const PHASES = 8;

// 8 directions, clockwise starting at north (must match COMPASS_DIRECTIONS in
// src/geometry/direction.ts)
const DIR_ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// forward/right unit vectors per direction
const DIR_VECTORS = {};
for (const name of DIR_ORDER) {
    const angle = { S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315, E: 0, SE: 45 }[name];
    const rad = (angle * Math.PI) / 180;
    const fx = Math.cos(rad);
    const fy = Math.sin(rad);
    DIR_VECTORS[name] = { fx, fy, rx: fy, ry: -fx };
}

// stride offset per phase, sampled as a sine wave so any PHASES count stays smooth
const STRIDE_A = Array.from({ length: PHASES }, (_, phase) => Math.sin((2 * Math.PI * phase) / PHASES)); // front-left + back-right
const STRIDE_B = STRIDE_A.map(s => -s); // front-right + back-left
const SWAY = STRIDE_A; // tail tip sway follows the same phase

// standing pose dimensions, in grid units
const STAND_HEAD_DIST = 7.5;
const STAND_TAIL_BASE = 6;
const STAND_TAIL_TIP = 9.5;

// the fox faces nw for all three curl-family rows
const CURL_FACING_DEG = 225;

// curled pose dimensions, in grid units
const CURL_HEAD_DIST = 5.0;

// tail sweep angle in degrees from rear (0 = straight back, 180 = over the nose)
const CURL_TAIL_SWEEP_MAX = 205; // just past the nose
const CURL_TAIL_SWEEP = Array.from(
    { length: PHASES },
    (_, phase) => (CURL_TAIL_SWEEP_MAX * (phase + 1)) / PHASES,
);
const CURL_POSE_T = Array.from({ length: PHASES }, (_, phase) => (phase + 1) / PHASES); // stand -> curl blend factor

// uncurl reverses the curl arc, ending with the standing tail straight behind
const UNCURL_TAIL_SWEEP = Array.from(
    { length: PHASES },
    (_, phase) => CURL_TAIL_SWEEP_MAX * (1 - (phase + 1) / PHASES),
);
const UNCURL_T = Array.from({ length: PHASES }, (_, phase) => (phase + 1) / PHASES); // curl -> stand blend factor

// sleepTurn: fixed curl, facing rotates one full turn across the row
const SLEEP_TURN_FACING_DEG = Array.from(
    { length: PHASES },
    (_, phase) => CURL_FACING_DEG + phase * (360 / PHASES),
);

/** all tunable fox sprite sheet parameters, grouped by pose/animation. */
export const constants = {
    grid: GRID,
    center: CENTER,
    block: BLOCK,
    cellPx: CELL_PX,
    phases: PHASES,

    colors: {
        orange: [232, 117, 44, 255],
        black: [16, 16, 16, 255],
        cream: [255, 243, 224, 255],
        white: [255, 255, 255, 255],
        rust: [188, 89, 32, 255], // darker orange, for the curled tail against the body
    },

    dirs: {
        order: DIR_ORDER,
        vectors: DIR_VECTORS,
    },

    stride: {
        a: STRIDE_A,
        b: STRIDE_B,
        sway: SWAY,
    },

    stand: {
        body: { a: 7, b: 3.3 },        // half-length/half-width, along forward/right
        head: { dist: STAND_HEAD_DIST, r: 2.6 },
        ear: { back: 1.4, spread: 1.8, r: 1.1 },
        snout: { dist: STAND_HEAD_DIST + 1.8, r: 1.2 },
        nose: { dist: STAND_HEAD_DIST + 3.0, r: 0.65 },
        leg: { forward: 4, side: 3.3, r: 1.5, stride: 1.2 },
        tail: { base: STAND_TAIL_BASE, tip: STAND_TAIL_TIP, r: 1.6, tipR: 2.0, sway: 2 },
    },

    curl: {
        facingDeg: CURL_FACING_DEG,
        body: { a: 5.5, b: 4.2 },
        head: { dist: CURL_HEAD_DIST, r: 2.3 },
        ear: { back: 1.1, spread: 1.5, r: 0.95 },
        snout: { dist: CURL_HEAD_DIST + 1.5, r: 1.0 },
        nose: { dist: CURL_HEAD_DIST + 2.5, r: 0.55 },
        tail: {
            sweepMax: CURL_TAIL_SWEEP_MAX,
            sweep: CURL_TAIL_SWEEP,
            arcR: 5.1, // radius of the curled tail's arc around the body
            r: 1.35,
            segments: 10, // arc sample resolution
            tipR: 1.7,
        },
        t: CURL_POSE_T,
    },

    uncurl: {
        tailSweep: UNCURL_TAIL_SWEEP,
        t: UNCURL_T,
    },

    sleepTurn: {
        facingDeg: SLEEP_TURN_FACING_DEG,
    },
};
