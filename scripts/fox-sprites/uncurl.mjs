import { constants } from "./constants.mjs";
import { CURL_POSE, STAND_POSE, lerpPose, buildPoseFrame } from "./pose.mjs";

/**
 * draws one frame of the uncurl animation: continues the curl tail's
 * rotation onward, drawn straight each frame, while the body and tail
 * proportions blend from curled to standing.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildUncurlFrame(phase) {
    const pose = lerpPose(CURL_POSE, STAND_POSE, constants.uncurl.t[phase]);
    const angle = constants.uncurl.tailAngle[phase];
    return buildPoseFrame(constants.curl.facingDeg, angle, angle, pose);
}
