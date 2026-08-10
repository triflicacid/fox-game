import {fieldRegistry, positiveNumber} from '../fields/field-registry';

export const SPECTATOR_CONSTANTS = {
    speed: 300,

    runMultiplier: 2
};

fieldRegistry.registerFields("world.spectator", SPECTATOR_CONSTANTS, {
    speed: positiveNumber(),
    runMultiplier: positiveNumber()
});
