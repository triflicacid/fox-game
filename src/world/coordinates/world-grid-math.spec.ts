import {describe, expect, it} from "vitest";
import {pixelRectToTileRange, tileToChunk} from "./world-grid-math";

describe("tileToChunk", () => {
    it.each([
        [-1, -1, -1, -1],
        [-16, -16, -1, -1],
        [-17, -17, -2, -2],
        [0, 0, 0, 0],
        [15, 15, 0, 0],
        [16, 16, 1, 1],
    ])("maps tile (%i, %i) to chunk (%i, %i)", (tileX, tileY, chunkX, chunkY) => {
        expect(tileToChunk(tileX, tileY)).toEqual({chunkX, chunkY});
    });
});

describe("pixelRectToTileRange", () => {
    it("keeps the far edge inclusive", () => {
        expect(pixelRectToTileRange(0, 0, 32, 16, 16)).toEqual({
            startTileX: 0,
            startTileY: 0,
            endTileX: 1,
            endTileY: 0,
        });
    });

    it("handles negative coordinates with floor semantics", () => {
        expect(pixelRectToTileRange(-1, -1, 1, 1, 16)).toEqual({
            startTileX: -1,
            startTileY: -1,
            endTileX: -1,
            endTileY: -1,
        });
    });
});


