import { describe, it, expect } from "vitest";
import { Registry } from "./registry";

interface Item {
    id: string;
    value: number;
}

/** Minimal concrete Registry keyed by the item's id string. */
class ItemRegistry extends Registry<string, Item> {
    protected keyOf(item: Item): string {
        return item.id;
    }
}

describe("Registry", () => {
    describe("get", () => {
        it("returns a registered value by key", () => {
            const registry = new ItemRegistry();
            const item = { id: "foo", value: 1 };

            registry.register(item);

            expect(registry.get("foo")).toBe(item);
        });

        it("returns undefined for an unknown key", () => {
            const registry = new ItemRegistry();

            expect(registry.get("nope")).toBeUndefined();
        });
    });

    describe("register", () => {
        it("registering the same instance twice is a no-op", () => {
            const registry = new ItemRegistry();
            const item = { id: "foo", value: 1 };

            registry.register(item);
            registry.register(item);

            expect(registry.getAll()).toHaveLength(1);
            expect(registry.get("foo")).toBe(item);
        });

        it("throws when a different value is registered under an existing key", () => {
            const registry = new ItemRegistry();
            const first = { id: "foo", value: 1 };
            const second = { id: "foo", value: 2 };

            registry.register(first);

            expect(() => registry.register(second)).toThrow("foo");
        });

        it("retains the original value after a failed registration", () => {
            const registry = new ItemRegistry();
            const first = { id: "foo", value: 1 };
            const second = { id: "foo", value: 2 };

            registry.register(first);
            try { registry.register(second); } catch { /* expected */ }

            expect(registry.get("foo")).toBe(first);
        });
    });

    describe("getAll", () => {
        it("returns all registered values", () => {
            const registry = new ItemRegistry();
            const a = { id: "a", value: 1 };
            const b = { id: "b", value: 2 };
            const c = { id: "c", value: 3 };

            registry.register(a);
            registry.register(b);
            registry.register(c);

            expect(registry.getAll()).toEqual(expect.arrayContaining([a, b, c]));
            expect(registry.getAll()).toHaveLength(3);
        });
    });

    describe("clear", () => {
        it("removes all registered values", () => {
            const registry = new ItemRegistry();

            registry.register({ id: "a", value: 1 });
            registry.register({ id: "b", value: 2 });
            registry.clear();

            expect(registry.getAll()).toHaveLength(0);
            expect(registry.get("a")).toBeUndefined();
        });
    });
});


