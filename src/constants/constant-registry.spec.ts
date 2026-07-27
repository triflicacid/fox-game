import { beforeEach, describe, expect, it } from "vitest";
import { ConstantRegistryError, clearRegistry, get, listPaths, registerHolder, reset, set } from "./constant-registry";
import { ConstantHolder, registerConstants } from "./constant-holder";

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

beforeEach(() => {
    clearRegistry();
});

describe("registerHolder", () => {
    it("throws when a path is already taken", () => {
        registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });

        expect(() =>
            registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 2 }, key: "durationMs" } }),
        ).toThrow(/already registered/);
    });
});

describe("get / set", () => {
    it("reads and writes a plain field entry directly on its holder", () => {
        const holder = { durationMs: 250 };
        registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        expect(get<FixtureSchema>("dash.durationMs")).toBe(250);

        set<FixtureSchema>("dash.durationMs", 500);

        expect(holder.durationMs).toBe(500);
        expect(get<FixtureSchema>("dash.durationMs")).toBe(500);
    });

    it("reads and writes through an accessor entry, running its setter side effect", () => {
        let value = 10;
        let setCalls = 0;
        registerHolder("movement", {
            debounceMs: {
                kind: "accessor",
                get: () => value,
                set: (next: number) => {
                    value = next;
                    setCalls++;
                },
            },
        });

        set<FixtureSchema>("movement.debounceMs", 20);

        expect(value).toBe(20);
        expect(setCalls).toBe(1);
        expect(get<FixtureSchema>("movement.debounceMs")).toBe(20);
    });

    it("throws when reading an unregistered path", () => {
        expect(() => get<FixtureSchema>("dash.durationMs")).toThrow(/No constant is registered/);
    });

    it("throws when writing an unregistered path", () => {
        expect(() => set<FixtureSchema>("dash.durationMs", 1)).toThrow(/No constant is registered/);
    });

    it("throws a ConstantRegistryError when writing a read-only accessor entry", () => {
        registerHolder("debug", { computedMs: { kind: "accessor", get: () => 42 } });

        expect(() => set<FixtureSchema>("debug.computedMs", 1)).toThrow(ConstantRegistryError);
        expect(() => set<FixtureSchema>("debug.computedMs", 1)).toThrow(/read-only/);
    });

    it("throws when writing a field entry marked readonly", () => {
        const holder = { durationMs: 250 };
        registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", readonly: true } });

        expect(get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(() => set<FixtureSchema>("dash.durationMs", 999)).toThrow(ConstantRegistryError);
        expect(holder.durationMs).toBe(250);
    });
});

describe("reset", () => {
    it("restores a plain field to its value at registration time", () => {
        const holder = { durationMs: 250 };
        registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        set<FixtureSchema>("dash.durationMs", 999);
        reset<FixtureSchema>("dash.durationMs");

        expect(holder.durationMs).toBe(250);
    });

    it("restores an accessor field by re-running its setter", () => {
        let value = 10;
        let setCalls = 0;
        registerHolder("movement", {
            debounceMs: {
                kind: "accessor",
                get: () => value,
                set: (next: number) => {
                    value = next;
                    setCalls++;
                },
            },
        });

        set<FixtureSchema>("movement.debounceMs", 999);
        setCalls = 0;
        reset<FixtureSchema>("movement.debounceMs");

        expect(value).toBe(10);
        expect(setCalls).toBe(1);
    });

    it("throws when resetting an unregistered path", () => {
        expect(() => reset<FixtureSchema>("dash.durationMs")).toThrow(/No constant is registered/);
    });
});

describe("listPaths", () => {
    it("lists every registered path when no prefix is given", () => {
        registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registerHolder("movement", { debounceMs: { kind: "field", holder: { debounceMs: 1 }, key: "debounceMs" } });

        expect(listPaths().sort()).toEqual(["dash.durationMs", "movement.debounceMs"]);
    });

    it("lists only paths nested under the given prefix", () => {
        registerHolder("dash", {
            durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" },
            trailColor: { kind: "field", holder: { trailColor: "#fff" }, key: "trailColor" },
        });
        registerHolder("movement", { debounceMs: { kind: "field", holder: { debounceMs: 1 }, key: "debounceMs" } });

        expect(listPaths("dash").sort()).toEqual(["dash.durationMs", "dash.trailColor"]);
    });

    it("does not match a sibling path that merely shares a prefix string", () => {
        registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registerHolder("dashboard", { x: { kind: "field", holder: { x: 1 }, key: "x" } });

        expect(listPaths("dash")).toEqual(["dash.durationMs"]);
    });
});

describe("registerConstants", () => {
    it("registers a plain object's own properties as fields", () => {
        const dashConstants = { durationMs: 250, trailColor: "#ff00ff" };
        registerConstants("dash", dashConstants);

        expect(get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");

        set<FixtureSchema>("dash.durationMs", 300);

        expect(dashConstants.durationMs).toBe(300);
    });

    it("uses an override instead of a direct field reference", () => {
        let internal = 10;
        let setCalls = 0;
        const obj = { debounceMs: 10 };
        registerConstants("movement", obj, {
            debounceMs: {
                get: () => internal,
                set: (value) => {
                    internal = value;
                    setCalls++;
                },
            },
        });

        set<FixtureSchema>("movement.debounceMs", 42);

        expect(internal).toBe(42);
        expect(setCalls).toBe(1);
        expect(obj.debounceMs).toBe(10);
    });

    it("marks a field readonly via an override, without switching it to an accessor", () => {
        const dashConstants = { durationMs: 250, trailColor: "#ff00ff" };
        registerConstants("dash", dashConstants, {
            trailColor: { readonly: true },
        });

        expect(get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");
        expect(() => set<FixtureSchema>("dash.trailColor", "#000000")).toThrow(ConstantRegistryError);
        expect(dashConstants.trailColor).toBe("#ff00ff");

        set<FixtureSchema>("dash.durationMs", 300);
        expect(dashConstants.durationMs).toBe(300);
    });
});

describe("ConstantHolder", () => {
    it("registers a class's own static fields", () => {
        @ConstantHolder("dash")
        // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- fixture class for testing the class decorator
        class DashFixture {
            public static durationMs = 250;
        }

        expect(get<FixtureSchema>("dash.durationMs")).toBe(250);

        set<FixtureSchema>("dash.durationMs", 500);

        expect(DashFixture.durationMs).toBe(500);
    });

    it("uses an override instead of a direct static field reference", () => {
        let internal = 5;
        let setCalls = 0;

        @ConstantHolder("movement", {
            debounceMs: {
                get: () => internal,
                set: (value: number) => {
                    internal = value;
                    setCalls++;
                },
            },
        })
        // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- fixture class for testing the class decorator
        class MovementFixture {
            private static debounceMs = 5;
        }

        set<FixtureSchema>("movement.debounceMs", 7);

        expect(internal).toBe(7);
        expect(setCalls).toBe(1);
        void MovementFixture; // referenced only for its decorator's side effect
    });
});
