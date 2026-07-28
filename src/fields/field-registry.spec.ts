import { beforeEach, describe, expect, it } from "vitest";
import { Field, FieldLookupHandler, FieldRegistry, FieldRegistryError, fieldRegistry, integerRange, nonNegativeInteger, nonNegativeNumber, numberRange } from "./field-registry";
import { FieldHolder } from "./field-holder";

/** A small fixture schema, standing in for `FieldSchema` in these tests. */
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

let registry: FieldRegistry;

beforeEach(() => {
    registry = new FieldRegistry();
    fieldRegistry.clear();
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
        expect(() => registry.get<FixtureSchema>("dash.durationMs")).toThrow(/No field is registered/);
    });

    it("throws when writing an unregistered path", () => {
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1)).toThrow(/No field is registered/);
    });

    it("throws a FieldRegistryError when writing a read-only accessor entry", () => {
        registry.registerHolder("debug", { computedMs: { kind: "accessor", get: () => 42 } });

        expect(() => registry.set<FixtureSchema>("debug.computedMs", 1)).toThrow(FieldRegistryError);
        expect(() => registry.set<FixtureSchema>("debug.computedMs", 1)).toThrow(/read-only/);
    });

    it("throws when writing a field entry marked readonly", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", readonly: true } });

        expect(registry.get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 999)).toThrow(FieldRegistryError);
        expect(holder.durationMs).toBe(250);
    });

    it("reports a read-only field as such even when the value's type also wouldn't have matched", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs", readonly: true } });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", "not a number" as unknown as number)).toThrow(
            /read-only/,
        );
        expect(holder.durationMs).toBe(250);
    });

    it("throws when the value's runtime type doesn't match the current value", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", { durationMs: { kind: "field", holder, key: "durationMs" } });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", "not a number" as unknown as number)).toThrow(
            FieldRegistryError,
        );
        expect(() => registry.set<FixtureSchema>("dash.durationMs", "not a number" as unknown as number)).toThrow(
            /expected number, got string/,
        );
        expect(holder.durationMs).toBe(250);
    });

    it("throws the capture validator's reason when it rejects a value", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: {
                kind: "field",
                holder,
                key: "durationMs",
                capture: (value: number) => (value === 0 ? "Cannot set to zero" : undefined),
            },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 0)).toThrow(FieldRegistryError);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 0)).toThrow(/Cannot set to zero/);
        expect(holder.durationMs).toBe(250);
    });

    it("allows a value the capture validator does not reject", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: {
                kind: "field",
                holder,
                key: "durationMs",
                capture: (value: number) => (value === 0 ? "Cannot set to zero" : undefined),
            },
        });

        registry.set<FixtureSchema>("dash.durationMs", 500);

        expect(holder.durationMs).toBe(500);
    });

});

describe("integerRange", () => {
    it("rejects a value below the minimum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: integerRange(0, 1000) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(FieldRegistryError);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(/below the minimum/);
        expect(holder.durationMs).toBe(250);
    });

    it("rejects a value above the maximum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: integerRange(0, 1000) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1001)).toThrow(FieldRegistryError);
        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1001)).toThrow(/above the maximum/);
        expect(holder.durationMs).toBe(250);
    });

    it("rejects a non-integer value", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: integerRange(0, 1000) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1.5)).toThrow(/not an integer/);
        expect(holder.durationMs).toBe(250);
    });

    it("allows an integer within range", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: integerRange(0, 1000) },
        });

        registry.set<FixtureSchema>("dash.durationMs", 500);

        expect(holder.durationMs).toBe(500);
    });
});

describe("numberRange", () => {
    it("rejects a value below the minimum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: numberRange(0, 1) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -0.1)).toThrow(/below the minimum/);
        expect(holder.durationMs).toBe(250);
    });

    it("rejects a value above the maximum", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: numberRange(0, 1) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 1.1)).toThrow(/above the maximum/);
        expect(holder.durationMs).toBe(250);
    });

    it("allows a non-integer value within range", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: numberRange(0, 1) },
        });

        registry.set<FixtureSchema>("dash.durationMs", 0.45);

        expect(holder.durationMs).toBe(0.45);
    });
});

describe("nonNegativeInteger / nonNegativeNumber", () => {
    it("nonNegativeInteger rejects a negative integer", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: nonNegativeInteger() },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(/below the minimum/);
        expect(holder.durationMs).toBe(250);
    });

    it("nonNegativeInteger allows zero and positive integers, with no upper bound", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: nonNegativeInteger() },
        });

        registry.set<FixtureSchema>("dash.durationMs", 0);
        expect(holder.durationMs).toBe(0);

        registry.set<FixtureSchema>("dash.durationMs", 1_000_000);
        expect(holder.durationMs).toBe(1_000_000);
    });

    it("nonNegativeNumber rejects a negative non-integer", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: nonNegativeNumber() },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -0.5)).toThrow(/below the minimum/);
        expect(holder.durationMs).toBe(250);
    });

    it("nonNegativeNumber allows a non-integer value", () => {
        const holder = { durationMs: 250 };
        registry.registerHolder("dash", {
            durationMs: { kind: "field", holder, key: "durationMs", capture: nonNegativeNumber() },
        });

        registry.set<FixtureSchema>("dash.durationMs", 4.2);

        expect(holder.durationMs).toBe(4.2);
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
        expect(() => registry.reset<FixtureSchema>("dash.durationMs")).toThrow(/No field is registered/);
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

        expect(() => registry.listPaths("nope")).toThrow(FieldRegistryError);
    });

    it("throws when nothing at all is registered and no prefix is given", () => {
        expect(() => registry.listPaths()).toThrow(FieldRegistryError);
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

describe("registerFields", () => {
    it("registers a plain object's own properties as fields", () => {
        const dashFields = { durationMs: 250, trailColor: "#ff00ff" };
        registry.registerFields("dash", dashFields);

        expect(registry.get<FixtureSchema>("dash.durationMs")).toBe(250);
        expect(registry.get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");

        registry.set<FixtureSchema>("dash.durationMs", 300);

        expect(dashFields.durationMs).toBe(300);
    });

    it("uses an override instead of a direct field reference", () => {
        let internal = 10;
        let setCalls = 0;
        const obj = { debounceMs: 10 };
        registry.registerFields("movement", obj, {
            debounceMs: {
                get: () => internal,
                set: (value) => {
                    internal = value;
                    setCalls++;
                },
            },
        });

        registry.set<FixtureSchema>("movement.debounceMs", 42);

        expect(internal).toBe(42);
        expect(setCalls).toBe(1);
        expect(obj.debounceMs).toBe(10);
    });

    it("marks a field readonly via an override, without switching it to an accessor", () => {
        const dashFields = { durationMs: 250, trailColor: "#ff00ff" };
        registry.registerFields("dash", dashFields, {
            trailColor: { readonly: true },
        });

        expect(registry.get<FixtureSchema>("dash.trailColor")).toBe("#ff00ff");
        expect(() => registry.set<FixtureSchema>("dash.trailColor", "#000000")).toThrow(FieldRegistryError);
        expect(dashFields.trailColor).toBe("#ff00ff");

        registry.set<FixtureSchema>("dash.durationMs", 300);
        expect(dashFields.durationMs).toBe(300);
    });

    it("declares numeric bounds via an integerRange capture", () => {
        const dashFields = { durationMs: 250, trailColor: "#ff00ff" };
        registry.registerFields("dash", dashFields, {
            durationMs: { capture: integerRange(0, 1000) },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", -1)).toThrow(FieldRegistryError);
        expect(dashFields.durationMs).toBe(250);

        registry.set<FixtureSchema>("dash.durationMs", 999);
        expect(dashFields.durationMs).toBe(999);
    });

    it("declares a capture validator via an override", () => {
        const dashFields = { durationMs: 250, trailColor: "#ff00ff" };
        registry.registerFields("dash", dashFields, {
            durationMs: {
                capture: (value) => (value === 0 ? "Cannot set to zero" : undefined),
            },
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 0)).toThrow(/Cannot set to zero/);
        expect(dashFields.durationMs).toBe(250);

        registry.set<FixtureSchema>("dash.durationMs", 500);
        expect(dashFields.durationMs).toBe(500);
    });

    it("accepts a bare capture function as shorthand for { capture }", () => {
        const dashFields = { durationMs: 250, trailColor: "#ff00ff" };
        registry.registerFields("dash", dashFields, {
            durationMs: (value) => (value === 0 ? "Cannot set to zero" : undefined),
        });

        expect(() => registry.set<FixtureSchema>("dash.durationMs", 0)).toThrow(/Cannot set to zero/);
        expect(dashFields.durationMs).toBe(250);

        registry.set<FixtureSchema>("dash.durationMs", 500);
        expect(dashFields.durationMs).toBe(500);
    });

    it("flattens a nested plain object into dotted leaf paths", () => {
        const worldFields = {
            dash: { durationMs: 250 },
            movement: { debounceMs: 10 },
        };
        registry.registerFields("world.entities.fox", worldFields);

        expect(registry.get<FixtureSchema>("world.entities.fox.dash.durationMs")).toBe(250);
        expect(registry.get<FixtureSchema>("world.entities.fox.movement.debounceMs")).toBe(10);
        expect(registry.getAllPaths("world.entities.fox").sort()).toEqual([
            "world.entities.fox.dash.durationMs",
            "world.entities.fox.movement.debounceMs",
        ]);

        registry.set<FixtureSchema>("world.entities.fox.dash.durationMs", 500);

        expect(worldFields.dash.durationMs).toBe(500);
    });

    it("marks one nested leaf readonly via a nested override, leaving its sibling writable", () => {
        const worldFields = {
            dash: { durationMs: 250 },
            movement: { debounceMs: 10 },
        };
        registry.registerFields("world.entities.fox", worldFields, {
            dash: {
                durationMs: { readonly: true },
            },
        });

        expect(() => registry.set<FixtureSchema>("world.entities.fox.dash.durationMs", 999)).toThrow(
            FieldRegistryError,
        );
        expect(worldFields.dash.durationMs).toBe(250);

        registry.set<FixtureSchema>("world.entities.fox.movement.debounceMs", 99);
        expect(worldFields.movement.debounceMs).toBe(99);
    });
});

describe("registerHandler / FieldLookupHandler", () => {
    /** A fixture handler standing in for `EntityLookupHandler`: one member per map entry, each exposing a `value` field as an inline accessor. */
    class GroupHandler extends FieldLookupHandler {
        public constructor(private readonly members: Map<string, { value: number }>) {
            super();
        }

        public listPaths(): string[] {
            return [...this.members.keys()];
        }

        public getAllPaths(): string[] {
            return this.listPaths().map((id) => `${id}.value`);
        }

        public get(segment: string): Record<string, unknown> {
            const member = this.members.get(segment);
            if (!member) {
                throw new FieldRegistryError(`No member '${segment}'.`);
            }
            return { value: { get: () => member.value, set: (next: number) => { member.value = next; } } };
        }
    }

    it("resolves get/set through a dynamically-returned plain object's inline accessor", () => {
        const members = new Map([["a", { value: 1 }]]);
        registry.registerHandler("group", new GroupHandler(members));

        expect(registry.get("group.a.value")).toBe(1);

        registry.set("group.a.value", 5);

        expect(members.get("a")?.value).toBe(5);
    });

    it("reflects live changes to the backing collection without re-registration", () => {
        const members = new Map([["a", { value: 1 }]]);
        registry.registerHandler("group", new GroupHandler(members));

        members.set("b", { value: 2 });
        expect(registry.listPaths("group").sort()).toEqual(["group.a", "group.b"]);
        expect(registry.get("group.b.value")).toBe(2);

        members.delete("a");
        expect(registry.listPaths("group")).toEqual(["group.b"]);
        expect(() => registry.get("group.a.value")).toThrow(/No member 'a'/);
    });

    it("propagates the handler's own error for an unknown segment", () => {
        registry.registerHandler("group", new GroupHandler(new Map()));

        expect(() => registry.get("group.nope.value")).toThrow(/No member 'nope'/);
    });

    it("names the specific missing property, not the whole path, when a dynamically-returned object lacks it", () => {
        registry.registerHandler("group", new GroupHandler(new Map([["a", { value: 1 }]])));

        expect(() => registry.get("group.a.bogus")).toThrow("'group.a' has no property 'bogus'.");
    });

    it("throws when a path resolves to a subtree rather than a value", () => {
        registry.registerHandler("group", new GroupHandler(new Map([["a", { value: 1 }]])));

        expect(() => registry.get("group.a")).toThrow(/resolves to a subtree/);
    });

    it("throws when a handler is already registered at a path", () => {
        registry.registerHandler("group", new GroupHandler(new Map()));

        expect(() => registry.registerHandler("group", new GroupHandler(new Map()))).toThrow(/already registered/);
    });

    it("merges a handler's listPaths into the registry's top-level and prefixed listings, alongside static holders", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHandler("group", new GroupHandler(new Map([["a", { value: 1 }]])));

        expect(registry.listPaths().sort()).toEqual(["dash", "group"]);
        expect(registry.listPaths("group")).toEqual(["group.a"]);
    });

    it("lists one level inside a handler's own dynamic subtree via a deeper prefix", () => {
        registry.registerHandler("group", new GroupHandler(new Map([["a", { value: 1 }]])));

        expect(registry.listPaths("group.a")).toEqual(["group.a.value"]);
    });

    it("merges a handler's getAllPaths into the registry's leaf listing, alongside static holders", () => {
        registry.registerHolder("dash", { durationMs: { kind: "field", holder: { durationMs: 1 }, key: "durationMs" } });
        registry.registerHandler("group", new GroupHandler(new Map([["a", { value: 1 }]])));

        expect(registry.getAllPaths().sort()).toEqual(["dash.durationMs", "group.a.value"]);
        expect(registry.getAllPaths("group.a")).toEqual(["group.a.value"]);
    });

    it("resolves straight to a field the handler returns directly, capture included", () => {
        class DirectFieldHandler extends FieldLookupHandler {
            private value = 5;

            public listPaths(): string[] {
                return ["clamped"];
            }

            public getAllPaths(): string[] {
                return ["clamped"];
            }

            public get(segment: string): Field<unknown> {
                if (segment !== "clamped") {
                    throw new FieldRegistryError(`No '${segment}'.`);
                }
                return {
                    kind: "accessor",
                    get: () => this.value,
                    set: (next: number) => { this.value = next; },
                    capture: nonNegativeInteger(),
                };
            }
        }
        registry.registerHandler("direct", new DirectFieldHandler());

        expect(registry.get("direct.clamped")).toBe(5);
        expect(() => registry.set("direct.clamped", -1)).toThrow(/below the minimum/);

        registry.set("direct.clamped", 10);
        expect(registry.get("direct.clamped")).toBe(10);
    });

    it("supports capture on an inline accessor embedded in a dynamically-returned plain object", () => {
        class BoundedGroupHandler extends FieldLookupHandler {
            private readonly member = { value: 5 };

            public listPaths(): string[] {
                return ["a"];
            }

            public getAllPaths(): string[] {
                return ["a.value"];
            }

            public get(segment: string): Record<string, unknown> {
                if (segment !== "a") {
                    throw new FieldRegistryError(`No '${segment}'.`);
                }
                return {
                    value: {
                        get: () => this.member.value,
                        set: (next: number) => { this.member.value = next; },
                        capture: nonNegativeInteger(),
                    },
                };
            }
        }
        registry.registerHandler("bounded", new BoundedGroupHandler());

        expect(() => registry.set("bounded.a.value", -1)).toThrow(/below the minimum/);

        registry.set("bounded.a.value", 20);
        expect(registry.get("bounded.a.value")).toBe(20);
    });

    it("resolves through a handler-of-handlers", () => {
        class OuterHandler extends FieldLookupHandler {
            public constructor(private readonly inner: FieldLookupHandler) {
                super();
            }

            public listPaths(): string[] {
                return ["inner"];
            }

            public getAllPaths(): string[] {
                return this.inner.getAllPaths().map((leaf) => `inner.${leaf}`);
            }

            public get(segment: string): FieldLookupHandler {
                if (segment !== "inner") {
                    throw new FieldRegistryError(`No '${segment}'.`);
                }
                return this.inner;
            }
        }
        const members = new Map([["a", { value: 7 }]]);
        registry.registerHandler("outer", new OuterHandler(new GroupHandler(members)));

        expect(registry.get("outer.inner.a.value")).toBe(7);

        registry.set("outer.inner.a.value", 8);
        expect(members.get("a")?.value).toBe(8);
    });
});

describe("FieldHolder", () => {
    it("registers a class's own static fields", () => {
        @FieldHolder("dash")
        // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- fixture class for testing the class decorator
        class DashFixture {
            public static durationMs = 250;
        }

        expect(fieldRegistry.get<FixtureSchema>("dash.durationMs")).toBe(250);

        fieldRegistry.set<FixtureSchema>("dash.durationMs", 500);

        expect(DashFixture.durationMs).toBe(500);
    });

    it("uses an override instead of a direct static field reference", () => {
        let internal = 5;
        let setCalls = 0;

        @FieldHolder("movement", {
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

        fieldRegistry.set<FixtureSchema>("movement.debounceMs", 7);

        expect(internal).toBe(7);
        expect(setCalls).toBe(1);
        void MovementFixture; // referenced only for its decorator's side effect
    });
});
