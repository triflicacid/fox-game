import { constants } from "./constants.mjs";
import { CURL_POSE, STAND_POSE, lerpPose, buildPoseFrame } from "./pose.mjs";

/**
 * draws one frame of the uncurl animation: reverses the curl tail's arc while
 * the body and tail proportions blend from curled to standing.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildUncurlFrame(phase) {
    const pose = lerpPose(CURL_POSE, STAND_POSE, constants.uncurl.t[phase]);
    const sweep = constants.uncurl.tailSweep[phase];
    return buildPoseFrame(constants.curl.facingDeg, 0, sweep, pose);
}
