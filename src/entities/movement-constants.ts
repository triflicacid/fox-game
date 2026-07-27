import {constantRegistry, nonNegativeInteger, nonNegativeNumber} from "../constants/constant-registry";

/**
 * Tuning values for movement speed, shared by {@link MovementController} and
 * anything scaling its own timing off the run multiplier.
 */
export const MOVEMENT_CONSTANTS = {
    /** Speed a bound entity moves at, in world pixels per second. */
    speed: 250,

    /** Factor a movement speed is scaled by while running (double-tapped). */
    runMultiplier: 1.6,
};

constantRegistry.registerConstants("world.movement", MOVEMENT_CONSTANTS, {
    speed: nonNegativeInteger(),
    runMultiplier: nonNegativeNumber(),
});
