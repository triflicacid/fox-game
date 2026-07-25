import { describe, it, expect, vi } from "vitest";
import { Cache } from "./cache";

/** Minimal concrete Cache that uses the key's string representation. */
class StringCache<V> extends Cache<string, V> {
    protected encodeKey(key: string): string {
        return key;
    }
}

describe("Cache", () => {
    describe("get", () => {
        it("calls compute on a cache miss, passing the original key", () => {
            const cache = new StringCache<number>();
            const compute = vi.fn(() => 42);

            cache.get("a", compute);

            expect(compute).toHaveBeenCalledOnce();
            expect(compute).toHaveBeenCalledWith("a");
        });

        it("returns the computed value on a cache miss", () => {
            const cache = new StringCache<number>();

            const result = cache.get("a", () => 99);

            expect(result).toBe(99);
        });

        it("returns the cached value on a hit without calling compute again", () => {
            const cache = new StringCache<number>();
            const compute = vi.fn(() => 7);

            cache.get("a", compute);
            const result = cache.get("a", compute);

            expect(compute).toHaveBeenCalledOnce();
            expect(result).toBe(7);
        });

        it.each([
            ["undefined", undefined],
            ["false", false],
            ["0", 0],
            ["empty string", ""],
        ])("caches falsy value: %s", (_label, falsyValue) => {
            const cache = new StringCache<unknown>();
            const compute = vi.fn(() => falsyValue);

            cache.get("a", compute);
            cache.get("a", compute);

            expect(compute).toHaveBeenCalledOnce();
        });

        it("caches keys independently", () => {
            const cache = new StringCache<number>();
            const computeA = vi.fn(() => 1);
            const computeB = vi.fn(() => 2);

            const a = cache.get("a", computeA);
            const b = cache.get("b", computeB);

            expect(a).toBe(1);
            expect(b).toBe(2);
            expect(computeA).toHaveBeenCalledOnce();
            expect(computeB).toHaveBeenCalledOnce();
        });
    });

    describe("clear", () => {
        it("causes the next get to recompute the value", () => {
            const cache = new StringCache<number>();
            const compute = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);

            expect(cache.get("a", compute)).toBe(1);
            cache.clear();
            expect(cache.get("a", compute)).toBe(2);
            expect(compute).toHaveBeenCalledTimes(2);
        });
    });
});


