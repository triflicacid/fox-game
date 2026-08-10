import {describe, expect, it} from "vitest";
import type {Chunk} from "./chunk";
import {ChunkStore} from "./chunk-store";

/** Builds a minimal fake chunk. */
function fakeChunk(ready: boolean): Chunk {
    return {
        getChunkX: () => 0,
        getChunkY: () => 0,
        getBiomeSummary: () => (ready ? "plains" : ""),
        getGenerationTimeMs: () => 0,
        isReady: () => ready,
        getCacheState: () => "live",
    };
}

describe("ChunkStore", () => {
    it("starts empty", () => {
        const store = new ChunkStore();

        expect(store.size).toBe(0);
        expect(store.has(0, 0)).toBe(false);
        expect(store.get(0, 0)).toBeUndefined();
        expect([...store.values()]).toEqual([]);
    });

    it("stores and retrieves a chunk by coordinate", () => {
        const store = new ChunkStore();
        const chunk = fakeChunk(true);

        store.set(3, -2, chunk);

        expect(store.size).toBe(1);
        expect(store.has(3, -2)).toBe(true);
        expect(store.get(3, -2)).toBe(chunk);
        expect(store.has(0, 0)).toBe(false);
    });

    it("overwrites an existing entry at the same coordinate without growing size", () => {
        const store = new ChunkStore();
        const first = fakeChunk(false);
        const second = fakeChunk(true);
        store.set(1, 1, first);

        store.set(1, 1, second);

        expect(store.size).toBe(1);
        expect(store.get(1, 1)).toBe(second);
    });

    it("removes a chunk, and is safe to call when nothing is loaded there", () => {
        const store = new ChunkStore();
        store.set(0, 0, fakeChunk(true));

        store.remove(0, 0);
        store.remove(5, 5);

        expect(store.size).toBe(0);
        expect(store.has(0, 0)).toBe(false);
    });

    it("clears every entry", () => {
        const store = new ChunkStore();
        store.set(0, 0, fakeChunk(true));
        store.set(1, 0, fakeChunk(true));

        store.clear();

        expect(store.size).toBe(0);
        expect([...store.values()]).toEqual([]);
    });

    it("counts only chunks that haven't finished generating", () => {
        const store = new ChunkStore();
        store.set(0, 0, fakeChunk(true));
        store.set(1, 0, fakeChunk(false));
        store.set(2, 0, fakeChunk(false));

        expect(store.getGeneratingCount()).toBe(2);
    });
});
