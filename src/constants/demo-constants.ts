import { registerConstants } from "./constant-holder";

/**
 * Manual-testing fixture for the tunable-constants registry (see
 * `plans/tunable-constants-plan.md`, Phase 1 §8). Exercises both field kinds
 * from the browser console:
 *
 * - `constants.get("demo.plainValue")` / `constants.set("demo.plainValue", 1)`
 *   reads/writes `DEMO_CONSTANTS.plainValue` directly.
 * - `constants.get("demo.sideEffectValue")` / `constants.set("demo.sideEffectValue", 1)`
 *   goes through a getter/setter pair that logs on write.
 *
 * Remove once Phase 2 migrates real constants (dash/movement/debug) onto the registry.
 */
const DEMO_CONSTANTS = {
    plainValue: 42,
    sideEffectValue: 10,
    nested: {
        a: "A",
        b: "B"
    }
};

registerConstants("demo", DEMO_CONSTANTS, {
    sideEffectValue: {
        get: () => DEMO_CONSTANTS.sideEffectValue,
        set: (value: number) => {
            console.log(`demo.sideEffectValue set to ${value}`);
            DEMO_CONSTANTS.sideEffectValue = value;
        },
    },
    nested: {
        a: { readonly: true },
    },
});
