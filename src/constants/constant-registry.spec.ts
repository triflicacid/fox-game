import { beforeEach, describe, expect, it } from "vitest";
import { ConstantRegistry, ConstantRegistryError, constantRegistry } from "./constant-registry";
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
    world: {
        entities: {
            fox: {
                dash: {
                    durationMs: number;
                };
                movement: {
                    debounceMs: number;
                };
            };
        };
    };
}

let registry: ConstantRegistry;

beforeEach(() => {
    registry = new ConstantRegistry();
    constantRegistry.clear();
});

describe("registerHolder", () => {
    it("throws when a path is already taken", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });

        expect(() =>
            registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 2 }, key: "durationMs" } }),
        ).toThrow(/already registered/);
    });
});

describe("get / set", () => {
    it("reads and writes a plain field entry directly on its holder", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        expect(registry.get<FixtureSchema>("dash.durationMs")).toBe(250);

        registry.set<FixtureSchema>("dash.durationMs", 500);

        expect(holder.durationMs).toBe(500);
        expect(registry.get<FixtureSchema>("dash.durationMs")).toBe(500);
    });

    it("reads and writes through an accessor entry, running its setter side effect", () => {
        let value = 10;
        let setCalls = 0;
        registry.registerHolder("movement", {
            debounceMs: {
                kind: "accessor",
                get: () => value,
                set: (next: number) => {
                    value = next;
                    setCalls++;
                },
            },
        });

        registry.set<FixtureSchema>("movement.debounceMs", 20);

        expect(value).toBe(20);
        expect(setCalls).toBe(1);
        expect(registry.get<FixtureSchema>("movement.debounceMs")).toBe(20);
    });

    it("throws when reading an unregistered path", () => {
        expect(() => registry.get<FixtureSchema>("dash.durationMs")).toThrow(/No constant is registered/);
    });

    it("throws when writing an unregistered path", () => {
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1)).toThrow(/No constant is registered/);
    });

    it("throws a ConstantRegistryError when writing a read-only accessor entry", () => {
        registry.registerHolder("debug", { computedMs: { kind: "accessor", get: () => 42 } });

        expect(() => registry.set<FixtureSchema>("debug.computedMs", 1)).toThrow(ConstantRegistryError);
        expect(() => registry.set<FixtureSchema>("debug.computedMs", 1)).toThrow(/read-only/);
    });

    it("throws when writing a field entry marked readonly", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", readonly: true } });

        expect(registry.get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 999)).toThrow(ConstantRegistryError);
        expect(holder.durationMs).toBe(250);
    });

    it("throws when the value's runtime type doesn't match the current value", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", "not a number" as unknown as number)).toThrow(
            ConstantRegistryError,
        );
        expect(() => registry.set<FixtureSchema>("dash.durationMs", "not a number" as unknown as number)).toThrow(
            /expected number, got string/,
        );
        expect(holder.durationMs).toBe(250);
    });

    it("throws when a number is below the declared minimum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", min: 0, max: 1000 } });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(ConstantRegistryError);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(/below the minimum/);
        expect(holder.durationMs).toBe(250);
    });

    it("throws when a number is above the declared maximum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", min: 0, max: 1000 } });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1001)).toThrow(ConstantRegistryError);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1001)).toThrow(/above the maximum/);
        expect(holder.durationMs).toBe(250);
    });

    it("allows a number within the declared range", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", min: 0, max: 1000 } });

        registry.set<FixtureSchema>("dash.durationMs", 500);

        expect(holder.durationMs).toBe(500);
    });
});

describe("reset", () => {
    it("restores a plain field to its value at registration time", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        registry.set<FixtureSchema>("dash.durationMs", 999);
        registry.reset<FixtureSchema>("dash.durationMs");

        expect(holder.durationMs).toBe(250);
    });

    it("restores an accessor field by re-running its setter", () => {
        let value = 10;
        let setCalls = 0;
        registry.registerHolder("movement", {
            debounceMs: {
                kind: "accessor",
                get: () => value,
                set: (next: number) => {
                    value = next;
                    setCalls++;
                },
            },
        });

        registry.set<FixtureSchema>("movement.debounceMs", 999);
        setCalls = 0;
        registry.reset<FixtureSchema>("movement.debounceMs");

        expect(value).toBe(10);
        expect(setCalls).toBe(1);
    });

    it("throws when resetting an unregistered path", () => {
        expect(() => registry.reset<FixtureSchema>("dash.durationMs")).toThrow(/No constant is registered/);
    });
});

describe("listPaths", () => {
    it("lists top-level segments when no prefix is given", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHolder("world.entities.fox.dash", {
            durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" },
        });

        expect(registry.listPaths().sort()).toEqual(["dash", "world"]);
    });

    it("lists only the next segment under a prefix, not the full leaf path", () => {
        registry.registerHolder("world.entities.fox.dash", {
            durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" },
        });
        registry.registerHolder("world.entities.fox.movement", {
            debounceMs: { kind: "field", holder: { debounceMs: 1 }, key: "debounceMs" },
        });

        expect(registry.listPaths("world")).toEqual(["world.entities"]);
        expect(registry.listPaths("world.entities")).toEqual(["world.entities.fox"]);
        expect(registry.listPaths("world.entities.fox").sort()).toEqual([
            "world.entities.fox.dash",
            "world.entities.fox.movement",
        ]);
    });

    it("lists leaf fields directly when they're only one level under the prefix", () => {
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" },
            trailColor: { kind: "field", holder: { trailColor: "#fff" }, key: "trailColor" },
        });

        expect(registry.listPaths("dash").sort()).toEqual(["dash.durationMs", "dash.trailColor"]);
    });

    it("does not match a sibling path that merely shares a prefix string", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHolder("dashboard", { x: { kind: "field", holder: { x: 1 }, key: "x" } });

        expect(registry.listPaths("dash")).toEqual(["dash.durationMs"]);
    });

    it("throws when the given prefix matches nothing registered", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });

        expect(() => registry.listPaths("nope")).toThrow(ConstantRegistryError);
    });

    it("throws when nothing at all is registered and no prefix is given", () => {
        expect(() => registry.listPaths()).toThrow(ConstantRegistryError);
    });
});

describe("getAllPaths", () => {
    it("lists every registered path when no prefix is given", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHolder("movement", { debounceMs: { kind: "field", holder: { debounceMs: 1 }, key: "debounceMs" } });

        expect(registry.getAllPaths().sort()).toEqual(["dash.durationMs", "movement.debounceMs"]);
    });

    it("lists every registered leaf path nested under a prefix, regardless of depth", () => {
        registry.registerHolder("world.entities.fox.dash", {
            durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" },
        });
        registry.registerHolder("world.entities.fox.movement", {
            debounceMs: { kind: "field", holder: { debounceMs: 1 }, key: "debounceMs" },
        });

        expect(registry.getAllPaths("world").sort()).toEqual([
            "world.entities.fox.dash.durationMs",
            "world.entities.fox.movement.debounceMs",
        ]);
    });

    it("does not match a sibling path that merely shares a prefix string", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHolder("dashboard", { x: { kind: "field", holder: { x: 1 }, key: "x" } });

        expect(registry.getAllPaths("dash")).toEqual(["dash.durationMs"]);
    });
});

describe("registerConstants", () => {
    it("registers a plain object's own properties as fields", () => {
        const dashConstants = { durationMs: 250, trailColor: "#ff00ff" };
        registerConstants("dash", dashConstants);

        expect(constantRegistry.get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(constantRegistry.get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");

        constantRegistry.set<FixtureSchema>("dash.durationMs", 300);

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

        constantRegistry.set<FixtureSchema>("movement.debounceMs", 42);

        expect(internal).toBe(42);
        expect(setCalls).toBe(1);
        expect(obj.debounceMs).toBe(10);
    });

    it("marks a field readonly via an override, without switching it to an accessor", () => {
        const dashConstants = { durationMs: 250, trailColor: "#ff00ff" };
        registerConstants("dash", dashConstants, {
            trailColor: { readonly: true },
        });

        expect(constantRegistry.get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");
        expect(() => constantRegistry.set<FixtureSchema>("dash.trailColor", "#000000")).toThrow(ConstantRegistryError);
        expect(dashConstants.trailColor).toBe("#ff00ff");

        constantRegistry.set<FixtureSchema>("dash.durationMs", 300);
        expect(dashConstants.durationMs).toBe(300);
    });

    it("declares numeric bounds via an override", () => {
        const dashConstants = { durationMs: 250, trailColor: "#ff00ff" };
        registerConstants("dash", dashConstants, {
            durationMs: { min: 0, max: 1000 },
        });

        expect(() => constantRegistry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(ConstantRegistryError);
        expect(dashConstants.durationMs).toBe(250);

        constantRegistry.set<FixtureSchema>("dash.durationMs", 999);
        expect(dashConstants.durationMs).toBe(999);
    });

    it("flattens a nested plain object into dotted leaf paths", () => {
        const worldConstants = {
            dash: { durationMs: 250 },
            movement: { debounceMs: 10 },
        };
        registerConstants("world.entities.fox", worldConstants);

        expect(constantRegistry.get<FixtureSchema>("world.entities.fox.dash.durationMs")).toBe(250);
        expect(constantRegistry.get<FixtureSchema>("world.entities.fox.movement.debounceMs")).toBe(10);
        expect(constantRegistry.getAllPaths("world.entities.fox").sort()).toEqual([
            "world.entities.fox.dash.durationMs",
            "world.entities.fox.movement.debounceMs",
        ]);

        constantRegistry.set<FixtureSchema>("world.entities.fox.dash.durationMs", 500);

        expect(worldConstants.dash.durationMs).toBe(500);
    });

    it("marks one nested leaf readonly via a nested override, leaving its sibling writable", () => {
        const worldConstants = {
            dash: { durationMs: 250 },
            movement: { debounceMs: 10 },
        };
        registerConstants("world.entities.fox", worldConstants, {
            dash: {
                durationMs: { readonly: true },
            },
        });

        expect(() => constantRegistry.set<FixtureSchema>("world.entities.fox.dash.durationMs", 999)).toThrow(
            ConstantRegistryError,
        );
        expect(worldConstants.dash.durationMs).toBe(250);

        constantRegistry.set<FixtureSchema>("world.entities.fox.movement.debounceMs", 99);
        expect(worldConstants.movement.debounceMs).toBe(99);
    });
});

describe("ConstantHolder", () => {
    it("registers a class's own static fields", () => {
        @ConstantHolder("dash")
        // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- fixture class for testing the class decorator
        class DashFixture {
            public static durationMs = 250;
        }

        expect(constantRegistry.get<FixtureSchema>("dash.durationMs")).toBe(250);

        constantRegistry.set<FixtureSchema>("dash.durationMs", 500);

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

        constantRegistry.set<FixtureSchema>("movement.debounceMs", 7);

        expect(internal).toBe(7);
        expect(setCalls).toBe(1);
        void MovementFixture; // referenced only for its decorator's side effect
    });
});
