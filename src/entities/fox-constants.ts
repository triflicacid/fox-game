import {fieldRegistry, nonNegativeInteger, nonNegativeNumber, numberRange} from '../fields/field-registry';

/** Configurable generic fox constants. */
export const FOX_CONSTANTS = {
    /** How long, in milliseconds, any of the fox's animations show each frame before advancing. */
    walkFrameMs: 120,

    /** Speed a fox moves at, in world pixels per second. */
    speed: 250,

    /** Factor a movement speed is scaled by while running (double-tapped). */
    runMultiplier: 1.6,

    /** Tuning values for the dash mechanic and its cyan trail effect. {@link DashConfiguration} */
    dash: {
        durationMs: 250,
        speedMultiplier: 4.2,
        cooldownMs: 450,
        trailColor: "#66e0ff",
        trailSnapshotCount: 4,
        trailSnapshotFadeMs: 160,
        trailSnapshotPeakAlpha: 0.45,
        burstLifetimeMs: 120,
        burstStartRadius: 4,
        burstEndRadius: 16,
        trailFadeTailMs: 100,
    },

    /** Tuning values for the swim mechanic. */
    swim: {
        speedMultiplier: 1.6 / 3.75,
    },
};

fieldRegistry.registerFields(`world.entities.fox`, FOX_CONSTANTS, {
    walkFrameMs: nonNegativeInteger(),
    speed: nonNegativeInteger(),
    runMultiplier: nonNegativeNumber(),
    dash: {
        durationMs: nonNegativeInteger(),
        speedMultiplier: nonNegativeNumber(),
        cooldownMs: nonNegativeInteger(),
        trailSnapshotCount: nonNegativeInteger(),
        trailSnapshotFadeMs: nonNegativeInteger(),
        trailSnapshotPeakAlpha: numberRange(0, 1),
        burstLifetimeMs: nonNegativeInteger(),
        burstStartRadius: nonNegativeInteger(),
        burstEndRadius: nonNegativeInteger(),
        trailFadeTailMs: nonNegativeInteger(),
    },
    swim: {
        speedMultiplier: nonNegativeNumber(),
    },
});
