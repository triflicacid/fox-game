import { constants } from "./constants.mjs";
import { CURL_POSE, buildPoseFrame } from "./pose.mjs";

/**
 * draws one frame of the curl animation: fully curled, fixed orientation, the
 * tail arcs further around the body each phase until its white tip lands
 * over the nose.
 *
 * @param {number} phase - animation phase, in `[0, PHASES)`.
 * @returns {(number[]|null)[]} row-major grid of rgba colors, `null` where transparent.
 */
export function buildCurlFrame(phase) {
    return buildPoseFrame(constants.curl.facingDeg, 0, constants.curl.tail.sweep[phase], CURL_POSE);
}
