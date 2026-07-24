import { constants } from "./constants.mjs";
import { CURL_POSE, STAND_POSE, lerpPose, buildPoseFrame } from "./pose.mjs";

/**
 * draws one frame of the curl animation: the body and tail proportions blend
 * from standing to curled while the tail arcs around the body until its white
 * tip lands over the nose.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildCurlFrame(phase) {
    const pose = lerpPose(STAND_POSE, CURL_POSE, constants.curl.t[phase]);
    return buildPoseFrame(constants.curl.facingDeg, 0, constants.curl.tail.sweep[phase], pose);
}
