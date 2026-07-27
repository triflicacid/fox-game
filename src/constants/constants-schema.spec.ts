import { describe, expectTypeOf, it } from "vitest";
import type { DotPath, ValueAt } from "./constants-schema";

/** A small fixture schema, standing in for `ConstantsSchema` in these tests. */
interface FixtureSchema {
    dash: {
        durationMs: number;
        trailColor: string;
    };
    movement: {
        debounceMs: number;
    };
    debug: {
        computedMs: number;
    };
}

describe("DotPath", () => {
    it("flattens a nested schema into a union of dotted paths", () => {
        expectTypeOf<DotPath<FixtureSchema>>().toEqualTypeOf<
            "dash.durationMs" | "dash.trailColor" | "movement.debounceMs" | "debug.computedMs"
        >();
    });
});

describe("ValueAt", () => {
    it("resolves a dotted path to its value type", () => {
        expectTypeOf<ValueAt<FixtureSchema, "dash.durationMs">>().toEqualTypeOf<number>();
        expectTypeOf<ValueAt<FixtureSchema, "dash.trailColor">>().toEqualTypeOf<string>();
    });

    it("resolves an unknown path to never", () => {
        expectTypeOf<ValueAt<FixtureSchema, "nope">>().toEqualTypeOf<never>();
    });
});
