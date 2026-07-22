import { createFrame, line, mirror, polygon, rectangle, setPixel } from "./raster.mjs";

export const CELL_WIDTH = 64;
export const CELL_HEIGHT = 72;
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const colors = {
    outline: [16, 16, 16, 255],
    orange: [232, 117, 44, 255],
    shadow: [188, 89, 32, 255],
    cream: [255, 243, 224, 255],
    white: [255, 255, 255, 255],
};

const { outline: K, orange: O, shadow: D, cream: W, white: X } = colors;

/**
 * Draws the oversized fox brush behind the body, including its layered cream tip.
 *
 * The tail is drawn in four passes so each layer composites cleanly:
 * black outer silhouette → orange body → cream tip → white inner highlight → shadow.
 *
 * @param {Buffer} frame - Destination idle-pose frame.
 * @param {"left"|"right"} [side="right"] - Side on which the tail appears.
 * @returns {void}
 */
function drawTail(frame, side = "right") {
    const flip = (points) => side === "right" ? points : points.map(([x, y]) => [CELL_WIDTH - 1 - x, y]);
    // Big rounded outer silhouette – ~30 % wider and taller than the old shape.
    // Right edge capped at x=59 so a ±3 px tail-sway never reaches the cell boundary.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,flip([[33,30],[40,27],[49,26],[57,29],[59,35],[59,45],[58,55],[55,63],[47,68],[37,68],[30,63],[28,53],[29,43],[31,37]]),K);
    // Orange body 1–2 px inside the outline.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,flip([[34,32],[40,29],[48,28],[56,31],[58,37],[58,46],[57,56],[54,63],[46,67],[37,67],[31,62],[30,52],[30,44],[32,38]]),O);
    // Large cream tip covering the outer ~40 % of the tail.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,flip([[58,41],[59,48],[58,57],[54,64],[46,68],[36,68],[29,63],[28,53],[32,58],[38,64],[46,66],[53,64],[57,59],[59,51]]),W);
    // White inner highlight makes the tip look thick and fluffy.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,flip([[57,45],[58,52],[57,60],[53,65],[45,67],[36,66],[31,62],[30,57],[34,61],[42,65],[50,63],[55,60],[57,54]]),X);
    // Dark shadow on the root to give depth to the thick base.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,flip([[34,32],[40,29],[48,28],[54,31],[50,36],[44,38],[38,37],[34,38]]),D);
}

/**
 * Draws the paired front/back legs and directional paw markings.
 *
 * @param {Buffer} frame - Destination idle-pose frame.
 * @param {boolean} back - Whether the character faces away from the viewer.
 * @returns {void}
 */
function drawFrontLegs(frame, back) {
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[23,43],[31,43],[32,52],[29,61],[27,67],[18,67],[17,65],[21,61],[22,52]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[32,43],[41,43],[42,52],[42,60],[47,64],[46,67],[36,67],[33,64],[35,60],[34,52]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[24,46],[29,46],[29,52],[27,60],[23,64],[20,64],[24,59]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[35,46],[39,46],[39,59],[44,64],[38,64],[36,61],[38,58],[37,51]],O);
    if (!back) {
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,19,64,26,66,W);
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,38,64,45,66,W);
    }
    line(frame,CELL_WIDTH,CELL_HEIGHT,[26,47],[25,58],D);
    line(frame,CELL_WIDTH,CELL_HEIGHT,[37,47],[38,58],D);
}

/**
 * Draws arms, hands, shoulders, waist, and torso shading for a frontal pose.
 *
 * @param {Buffer} frame - Destination idle-pose frame.
 * @param {boolean} back - Whether to omit front-facing chest detail.
 * @returns {void}
 */
function drawFrontTorso(frame, back) {
    // Arms are painted first so the torso cleanly owns the shoulder seams.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,27],[16,29],[13,37],[12,47],[15,52],[20,50],[19,46],[20,38],[24,33]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[42,27],[48,29],[51,37],[52,47],[49,52],[44,50],[45,46],[44,38],[40,33]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[21,30],[18,31],[16,38],[15,46],[17,49],[19,47],[18,44],[21,34]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[43,30],[46,31],[48,38],[49,46],[47,49],[45,47],[46,44],[43,34]],O);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,14,48,19,51,K);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,45,48,50,51,K);
    // The tapered torso keeps the silhouette humanoid rather than rectangular.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[25,25],[20,28],[19,34],[21,40],[21,45],[24,48],[40,48],[43,45],[43,40],[45,34],[44,28],[39,25]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[26,28],[22,30],[22,34],[24,39],[24,44],[26,45],[38,45],[40,43],[40,38],[42,33],[41,29],[38,28]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[38,28],[41,30],[40,37],[38,40],[38,44],[35,45],[35,32]],D);
    if (back) {
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,28],[32,30],[35,28],[34,33],[32,35],[30,33]],D);
    }
}

/**
 * Draws the orange neck and frontal fox head, with alternate rear-head detail.
 *
 * @param {Buffer} frame - Destination idle-pose frame.
 * @param {boolean} back - Whether to draw the back of the head.
 * @returns {void}
 */
function drawFrontHead(frame, back) {
    // A short tapered neck is mostly hidden by the jaw and chest ruff.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[28,21],[36,21],[37,27],[40,29],[38,32],[26,32],[24,29],[27,27]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[30,22],[34,22],[35,27],[37,29],[35,30],[29,30],[27,29],[29,27]],O);
    // Ears and cheek points establish the fox silhouette before facial layers.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[21,4],[26,8],[29,6],[35,6],[38,8],[44,3],[43,13],[47,17],[44,20],[43,24],[38,27],[26,27],[21,24],[20,20],[17,17],[20,13]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,7],[26,10],[29,8],[35,8],[38,10],[42,6],[41,14],[44,17],[41,18],[40,22],[37,24],[27,24],[24,22],[23,18],[20,17],[23,14]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,6],[27,10],[23,13]],D);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[42,6],[37,10],[41,13]],D);
    if (back) {
        // Rear views expose crown and nape shading, never face or chest white.
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[25,10],[29,8],[35,8],[39,10],[38,17],[35,22],[32,24],[29,22],[26,17]],D);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[26,9],[29,8],[32,10],[35,8],[38,9],[36,13],[28,13]],O);
        line(frame,CELL_WIDTH,CELL_HEIGHT,[27,20],[32,23],K);
        line(frame,CELL_WIDTH,CELL_HEIGHT,[32,23],[37,20],K);
        return;
    }
    // Cream eye masks and muzzle sit inside the orange facial silhouette.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[23,14],[29,11],[31,14],[29,17],[24,17]],W);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[41,14],[35,11],[33,14],[35,17],[40,17]],W);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,27,14,29,16,K);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,35,14,37,16,K);
    setPixel(frame,CELL_WIDTH,CELL_HEIGHT,28,14,X); setPixel(frame,CELL_WIDTH,CELL_HEIGHT,36,14,X);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[25,18],[29,16],[32,18],[35,16],[39,18],[38,22],[33,24],[31,24],[26,22]],W);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[30,18],[32,17],[34,18],[33,20],[31,20]],K);
}

/**
 * Draws layered cream chest fur below, but not over, the orange neck.
 *
 * @param {Buffer} frame - Destination front-facing frame.
 * @returns {void}
 */
function drawFrontRuff(frame) {
    // The orange neck remains visible below the jaw; cream begins at the
    // collar line and then fans into layered chest points.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[27,29],[32,31],[37,29],[38,32],[36,34],[35,38],[32,42],[29,38],[28,34],[26,32]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,30],[32,32],[35,30],[36,32],[34,34],[34,37],[32,39],[30,36],[30,34],[28,32]],W);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[30,31],[32,33],[34,31],[34,33],[32,37],[31,34]],X);
}

/**
 * Builds a complete front or rear idle pose in back-to-front layer order.
 *
 * @param {boolean} [back=false] - Whether to build the rear-facing variant.
 * @param {"left"|"right"} [tailSide="right"] - Side on which to layer the tail.
 * @returns {Buffer} The completed idle-pose RGBA frame.
 */
function front(back = false, tailSide = "right") {
    const frame=createFrame(CELL_WIDTH,CELL_HEIGHT);
    // Front-facing tails sit behind the body. Rear-facing tails are painted
    // after legs/torso so they appear in the foreground where they attach to
    // the visible back, while the head remains the topmost layer.
    if (!back) drawTail(frame,tailSide);
    drawFrontLegs(frame,back);
    drawFrontTorso(frame,back);
    if (back) drawTail(frame,tailSide);
    drawFrontHead(frame,back);
    if (!back) drawFrontRuff(frame);
    return frame;
}

/**
 * Builds the right-facing profile idle pose with a visible orange throat.
 *
 * @returns {Buffer} The completed right-profile RGBA frame.
 */
function side() {
    const frame=createFrame(CELL_WIDTH,CELL_HEIGHT);
    // The profile tail keeps the corrected low-back attachment but returns to
    // the simpler original style. Its contour is small at the root, remains
    // similarly small through the middle, then expands into a broad distal
    // brush—never thick, pinched, then thick again.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[34,40],[30,41],[26,42],[22,43],[18,44],[13,44],[8,46],[4,48],[2,52],[2,58],[5,63],[11,66],[17,67],[22,65],[25,62],[27,58],[25,55],[22,53],[18,52],[14,53],[10,56],[7,57],[6,54],[8,51],[13,48],[18,47],[23,47],[28,46],[34,45]],K);
    // Orange interior preserves the narrow root/middle and rounded brush.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[32,42],[29,42],[25,44],[21,45],[17,46],[12,46],[7,48],[4,51],[4,57],[7,61],[12,64],[17,65],[21,63],[23,61],[25,58],[23,56],[20,54],[17,54],[13,55],[9,58],[6,57],[8,53],[12,50],[18,49],[23,49],[28,47],[32,45]],O);
    // The large cream cap begins only where the narrow shaft opens into brush.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[12,46],[7,48],[4,51],[3,55],[4,59],[7,63],[12,66],[17,67],[22,65],[25,62],[24,58],[20,55],[17,54],[13,55],[9,58],[6,57],[8,53],[12,50]],W);
    // White centre gives the cream brush its familiar full fox-tail volume.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[8,50],[5,53],[5,58],[8,61],[12,64],[17,65],[20,63],[22,60],[20,57],[17,56],[13,57],[9,59],[7,56],[9,53],[13,51]],X);
    // Root shadow places the small base behind the hip without widening it.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[32,42],[29,42],[25,44],[21,45],[23,48],[28,49],[32,46]],D);
    // Legs are offset to preserve depth in the narrow side silhouette.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,44],[36,44],[37,54],[35,62],[40,65],[39,68],[30,68],[28,65],[31,60]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[35,43],[42,44],[42,54],[44,61],[49,65],[48,68],[38,68],[36,65],[38,60],[37,52]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[31,46],[35,46],[34,57],[32,64],[37,65],[32,65],[31,62]],D);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[37,46],[40,46],[40,55],[42,62],[46,65],[40,65],[39,62]],O);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,40,65,47,67,W);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,27],[25,30],[26,37],[29,43],[34,47],[42,46],[44,40],[43,31],[39,27]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[31,29],[28,31],[29,37],[32,43],[39,44],[41,40],[40,31],[38,29]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[40,29],[45,32],[46,41],[44,50],[39,50],[38,47],[41,44],[40,36]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[41,32],[43,34],[44,40],[42,47],[40,47],[42,43]],O);
    // The neck slopes from shoulder to jaw while remaining visibly orange.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[31,21],[39,21],[39,26],[43,29],[44,32],[39,33],[35,30],[29,29],[31,26]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[33,22],[37,22],[37,27],[41,30],[39,31],[36,28],[32,28],[33,26]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[24,5],[30,9],[34,6],[39,8],[41,4],[44,13],[49,16],[52,20],[49,24],[43,25],[39,28],[31,27],[27,23],[25,18],[22,16]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[26,8],[30,11],[34,8],[38,10],[40,7],[42,15],[47,17],[50,20],[48,22],[42,22],[38,25],[32,24],[29,21],[28,17],[25,15]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[35,13],[41,13],[43,16],[40,18],[35,17]],W);
    rectangle(frame,CELL_WIDTH,CELL_HEIGHT,38,14,40,16,K); setPixel(frame,CELL_WIDTH,CELL_HEIGHT,39,14,X);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[39,18],[44,17],[50,20],[48,22],[42,22],[38,20]],W);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[48,19],[51,20],[49,22],[47,21]],K);
    // The side ruff starts at the collar, leaving the throat orange.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[32,29],[36,30],[40,29],[39,32],[41,33],[38,35],[38,38],[36,40],[34,36],[31,34]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[34,30],[36,31],[39,30],[38,33],[39,34],[37,35],[37,38],[35,36],[33,34]],W);
    return frame;
}

/**
 * Builds a right-facing diagonal pose from the matching frontal construction.
 *
 * @param {boolean} [back=false] - Whether to build a rear three-quarter view.
 * @returns {Buffer} The completed diagonal RGBA frame.
 */
function threeQuarter(back = false) {
    const frame=createFrame(CELL_WIDTH,CELL_HEIGHT);

    // In the front diagonal the tail stays behind the body. In the rear
    // diagonal it is painted after the body so its root is visible over the
    // fox's back, matching the straight rear view.
    if (!back) drawTail(frame,"left");

    // Offset legs establish near/far depth and rotate the hips toward screen-right.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[23,43],[30,43],[30,53],[27,62],[25,67],[17,67],[16,65],[21,60]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[32,43],[40,44],[42,54],[46,62],[49,65],[48,68],[38,68],[35,64],[37,59],[36,51]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[24,46],[28,46],[27,56],[22,64],[19,64],[24,58]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[35,46],[38,47],[39,55],[45,64],[39,64],[38,61]],back?D:O);
    if (!back) {
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,19,64,25,66,W);
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,40,64,47,66,W);
    }

    // Far arm sits partly behind the rotated torso.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[23,28],[17,31],[15,40],[16,49],[20,52],[23,49],[21,45],[22,37],[27,32]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,31],[19,33],[18,40],[19,47],[21,49],[21,45],[23,35]],D);

    // Asymmetric shoulders, waist, and side shadow make the torso visibly turn.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[27,25],[22,28],[21,35],[23,43],[27,48],[39,48],[44,43],[44,34],[42,27],[36,24]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[28,28],[24,30],[24,35],[26,41],[29,45],[37,45],[41,42],[41,34],[39,28],[35,27]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[36,27],[40,29],[40,38],[38,44],[34,45],[35,36]],D);

    // Near arm is farther right and remains unobscured by the torso.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[40,27],[46,31],[48,39],[48,47],[45,52],[40,50],[41,47],[44,44],[43,36],[38,32]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[41,30],[44,33],[46,39],[46,45],[44,48],[42,47],[44,43],[42,34]],O);

    if (back) {
        drawTail(frame,"left");
    }

    // Neck and head lean toward screen-right; the muzzle/cheek silhouette is
    // visibly offset rather than retaining the straight-on head shape.
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,21],[38,21],[39,26],[43,29],[42,32],[36,31],[32,32],[27,29],[29,26]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[31,22],[36,22],[37,27],[40,29],[39,30],[35,29],[32,30],[29,29],[31,26]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[20,5],[26,9],[30,6],[36,7],[42,3],[41,13],[46,16],[49,20],[46,24],[39,27],[29,26],[23,23],[22,19],[18,17],[21,13]],K);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,8],[26,11],[30,8],[36,9],[40,6],[39,14],[44,17],[47,20],[44,22],[38,24],[30,23],[26,21],[25,17],[21,16],[24,14]],O);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[22,7],[27,11],[23,14]],D);
    polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[40,6],[36,10],[39,13]],D);

    if (back) {
        // Rear diagonal shows crown/nape shading and no face or chest white.
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[25,11],[30,8],[37,9],[39,14],[37,20],[33,24],[28,21],[25,17]],D);
        line(frame,CELL_WIDTH,CELL_HEIGHT,[29,21],[34,23],K);
        line(frame,CELL_WIDTH,CELL_HEIGHT,[34,23],[39,20],K);
    } else {
        // Unequal eye masks and a right-projecting muzzle sell the turn.
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[24,14],[29,11],[32,14],[29,17],[25,17]],W);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[38,13],[42,14],[44,17],[40,18],[36,16]],W);
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,28,14,30,16,K);
        rectangle(frame,CELL_WIDTH,CELL_HEIGHT,39,14,41,16,K);
        setPixel(frame,CELL_WIDTH,CELL_HEIGHT,29,14,X);
        setPixel(frame,CELL_WIDTH,CELL_HEIGHT,40,14,X);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[29,18],[34,16],[37,18],[42,17],[46,20],[44,22],[38,23],[33,22]],W);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[43,19],[46,20],[44,22],[42,21]],K);

        // Chest fur follows the rotated sternum instead of being centred.
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[31,29],[35,30],[39,29],[41,31],[39,33],[38,37],[36,40],[34,36],[31,34]],K);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[33,30],[35,31],[38,30],[39,31],[37,33],[37,36],[36,38],[35,34],[32,33]],W);
        polygon(frame,CELL_WIDTH,CELL_HEIGHT,[[34,31],[36,32],[37,31],[36,35],[35,33]],X);
    }
    return frame;
}

/**
 * Builds all eight directional idle poses, mirroring paired left-facing views.
 *
 * @returns {Record<string, Buffer>} Idle frames keyed by compass direction.
 */
export function buildIdlePoses() {
    const S=front(false);
    const N=front(true);
    const E=side();
    const SE=threeQuarter(false);
    const NW=threeQuarter(true);
    return {
        N,
        NE:mirror(NW,CELL_WIDTH,CELL_HEIGHT),
        E,
        SE,
        S,
        SW:mirror(SE,CELL_WIDTH,CELL_HEIGHT),
        W:mirror(E,CELL_WIDTH,CELL_HEIGHT),
        NW,
    };
}


