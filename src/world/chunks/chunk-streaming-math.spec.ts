import {describe, expect, it} from "vitest";
import {
    bufferChunkRange,
    chunkGenerationPriority,
    coordinatesInRange,
    DEFAULT_CHUNK_BUFFER,
    isOutsideChunkRange,
    visibleChunkRange,
} from "./chunk-streaming-math";

describe("visibleChunkRange", () => {
    it("includes the camera view's exact far chunk boundary", () => {
        expect(visibleChunkRange(0, 0, 256, 256, 256)).toEqual({
            startChunkX: 0,
            startChunkY: 0,
            endChunkX: 1,
            endChunkY: 1,
        });
    });
});

describe("bufferChunkRange", () => {
    it("expands a range by the default two-chunk buffer", () => {
        expect(bufferChunkRange({startChunkX: 0, startChunkY: 0, endChunkX: 1, endChunkY: 1})).toEqual({
            startChunkX: -DEFAULT_CHUNK_BUFFER,
            startChunkY: -DEFAULT_CHUNK_BUFFER,
            endChunkX: 1 + DEFAULT_CHUNK_BUFFER,
            endChunkY: 1 + DEFAULT_CHUNK_BUFFER,
        });
    });
});

describe("chunkGenerationPriority", () => {
    it("ties chunks symmetrically around the focus", () => {
        expect(chunkGenerationPriority({chunkX: 0, chunkY: 0}, 16, 16, 16)).toBe(
            chunkGenerationPriority({chunkX: 1, chunkY: 1}, 16, 16, 16)
        );
    });
});

describe("coordinatesInRange", () => {
    it("iterates inclusively in row-major order", () => {
        expect([...coordinatesInRange({startChunkX: 1, startChunkY: 2, endChunkX: 2, endChunkY: 3})]).toEqual([
            {chunkX: 1, chunkY: 2},
            {chunkX: 2, chunkY: 2},
            {chunkX: 1, chunkY: 3},
            {chunkX: 2, chunkY: 3},
        ]);
    });
});

describe("isOutsideChunkRange", () => {
    it("treats range edges as inside", () => {
        const range = {startChunkX: -1, startChunkY: -1, endChunkX: 1, endChunkY: 1};

        expect(isOutsideChunkRange(-1, -1, range)).toBe(false);
        expect(isOutsideChunkRange(1, 1, range)).toBe(false);
        expect(isOutsideChunkRange(2, 1, range)).toBe(true);
    });
});

