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
const STAND_LEG_FORWARD = 4;
const STAND_LEG_SIDE = 3.3;
const STAND_LEG_R = 1.5;

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

// per-phase elongation blend: 0 = standing proportions, 1 = fully stretched.
// phase 0 (launch) eases in, phase 1 (extension) hits the max stretch, phases
// 2-5 (airborne hold) stay near it, phases 6-7 (landing) ease back to standing.
const LEAP_STRETCH_T = [0.3, 1, 0.85, 0.85, 0.85, 0.85, 0.35, 0.05];

// extra forward/back leg reach at launch push-off, beyond STAND_LEG_FORWARD, in grid units
const LEAP_LEG_REACH = 1.8;

// per-phase leg position/visibility, in (front-left, front-right, back-left,
// back-right) order matching STAND_POSE.legs; r = 0 means tucked away (hidden)
const LEAP_LEGS_LAUNCH = [
    { u: STAND_LEG_FORWARD + LEAP_LEG_REACH, v: -STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: STAND_LEG_FORWARD + LEAP_LEG_REACH, v: STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: -STAND_LEG_FORWARD - LEAP_LEG_REACH, v: -STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: -STAND_LEG_FORWARD - LEAP_LEG_REACH, v: STAND_LEG_SIDE, r: STAND_LEG_R },
];
const LEAP_LEGS_TUCKED = [
    { u: 0, v: 0, r: 0 },
    { u: 0, v: 0, r: 0 },
    { u: 0, v: 0, r: 0 },
    { u: 0, v: 0, r: 0 },
];
const LEAP_LEGS_LANDING_FRONT = [
    { u: STAND_LEG_FORWARD, v: -STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: STAND_LEG_FORWARD, v: STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: 0, v: 0, r: 0 },
    { u: 0, v: 0, r: 0 },
];
const LEAP_LEGS_STAND = [
    { u: STAND_LEG_FORWARD, v: -STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: STAND_LEG_FORWARD, v: STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: -STAND_LEG_FORWARD, v: -STAND_LEG_SIDE, r: STAND_LEG_R },
    { u: -STAND_LEG_FORWARD, v: STAND_LEG_SIDE, r: STAND_LEG_R },
];
const LEAP_LEGS = [
    LEAP_LEGS_LAUNCH,        // 0: launch push-off, reaching/trailing
    LEAP_LEGS_TUCKED,        // 1: extension, legs finish tucking
    LEAP_LEGS_TUCKED,        // 2: airborne hold
    LEAP_LEGS_TUCKED,        // 3: airborne hold
    LEAP_LEGS_TUCKED,        // 4: airborne hold
    LEAP_LEGS_TUCKED,        // 5: airborne hold
    LEAP_LEGS_LANDING_FRONT, // 6: landing, front paws contact first
    LEAP_LEGS_STAND,         // 7: rear paws catch up, near-standing
];

// stretched-pose dimensions at stretchT = 1, blended against `stand` at
// stretchT = 0; snout/nose keep their fixed offset-from-head and radius
const LEAP_STRETCH = {
    body: { a: 9.5, b: 2.6 },
    head: { dist: 9.8, r: 2.3 },
    ear: { back: 1.0, spread: 1.3, r: 0.85 },
    tail: { base: 7.5, tip: 14, r: 1.2, tipR: 1.5 },
};

// grid units of breathing room added around the leap pose's measured extents
// when sizing each direction's dash canvas, so the art doesn't sit flush on
// the cell edge
const LEAP_EXTENT_PADDING = 1;

// fraction of the tail's base-to-tip length, in [0, 1], where the cyan tip
// accent starts blending in; below this the tail stays plain orange.
const DASH_TAIL_FADE_START = 0.1;

// true: tail blends from orange to DASH_ACCENT_COLOR starting at
// DASH_TAIL_FADE_START; false: tail stays plain orange up to the tip accent,
// with no gradient
const ADD_COLOUR_FADE = true;

// the dash tail-tip/fade accent color (rgba).
const DASH_ACCENT_COLOR = [90, 220, 240, 255];

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
        leg: { forward: STAND_LEG_FORWARD, side: STAND_LEG_SIDE, r: STAND_LEG_R, stride: 1.2 },
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

    leap: {
        extentPadding: LEAP_EXTENT_PADDING,
        stretchT: LEAP_STRETCH_T,
        stretch: LEAP_STRETCH,
        legs: LEAP_LEGS,
    },

    dash: {
        accentColor: DASH_ACCENT_COLOR,
        addColourFade: ADD_COLOUR_FADE,
        tailFadeStart: DASH_TAIL_FADE_START,
    },
};
