import {fieldRegistry, nonNegativeInteger, nonNegativeNumber, numberRange} from '../fields/field-registry';
import {Fox} from './fox';

/** Configurable generic fox constants. */
export const FOX_CONSTANTS = {
    /** How long, in milliseconds, any of the fox's animations show each frame before advancing. */
    walkFrameMs: 120,

    /** Speed a fox moves at, in world pixels per second. */
    speed: 250,

    /** Factor a movement speed is scaled by while running (double-tapped). */
    runMultiplier: 1.6,

    /** Tuning values for the dash mechanic and its cyan trail effect. */
    dash: {
        /** How long, in milliseconds, an active dash lasts. */
        durationMs: 250,

        /** Factor the base movement speed is scaled by during an active dash. */
        speedMultiplier: 4.2,

        /** How long, in milliseconds, after a dash ends before another can start. */
        cooldownMs: 450,

        /** Fill colour used to tint the launch burst and afterimage trail. Change this to retheme the whole effect. */
        trailColor: "#66e0ff",

        /** How many afterimage snapshots the trail keeps at once; the oldest is dropped first. */
        trailSnapshotCount: 4,

        /** How long, in milliseconds, a single captured afterimage snapshot stays visible before fully fading. */
        trailSnapshotFadeMs: 160,

        /** Peak opacity of the most recently captured afterimage snapshot; older snapshots are dimmer still. */
        trailSnapshotPeakAlpha: 0.45,

        /** How long, in milliseconds, the launch burst grows and fades before disappearing. */
        burstLifetimeMs: 120,

        /** Launch burst's starting radius, in world pixels. */
        burstStartRadius: 4,

        /** Launch burst's radius once fully grown, in world pixels. */
        burstEndRadius: 16,

        /**
         * Upper bound, in milliseconds after the dash's own travel ends, by
         * which every trail visual must have fully faded.
         */
        trailFadeTailMs: 100,
    },
};

fieldRegistry.registerFields(`world.entities.${Fox.ENTITY_TYPE_ID}`, FOX_CONSTANTS, {
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
});
