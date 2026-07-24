import { constants } from "./constants.mjs";
import { buildCurlFrame } from "./curl.mjs";
import { CURL_POSE, buildPoseFrame } from "./pose.mjs";

/**
 * draws one frame of the sleepTurn animation: stays fully curled but rotates
 * the facing angle each phase, as if the fox is repositioning without
 * uncurling.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildSleepTurnFrame(phase) {
    if (phase === 0) {
        return buildCurlFrame(constants.phases - 1);
    }
    return buildPoseFrame(
        constants.sleepTurn.facingDeg[phase],
        0,
        constants.curl.tail.sweepMax,
        CURL_POSE,
    );
}
