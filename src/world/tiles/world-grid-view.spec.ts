import {describe, expect, it, vi} from "vitest";
import type {Tile} from "./tile";
import {DefaultWorldGridView} from "./world-grid-view";
import {createTestChunk} from "../testing/world-test-helpers";

describe("DefaultWorldGridView", () => {
    it("requests the containing chunk for generating tile reads", () => {
        const tile = {featureTag: "lake.shallow"} as Tile;
        const requestChunk = vi.fn((chunkX: number, chunkY: number) =>
            Object.assign(createTestChunk(chunkX, chunkY, {ready: true}), {
                getTile: () => tile,
            })
        );
        const view = new DefaultWorldGridView(requestChunk, () => undefined);

        expect(view.requestTile(17, 33)).toBe(tile);
        expect(requestChunk).toHaveBeenCalledWith(1, 2);
    });

    it("returns none for generating feature and structure tag reads", () => {
        const requestChunk = vi.fn((chunkX: number, chunkY: number) => createTestChunk(chunkX, chunkY));
        const view = new DefaultWorldGridView(requestChunk, () => undefined);

        expect(view.requestFeatureTag(0, 0)).toBe("none");
        expect(view.requestStructureTag(0, 0)).toBe("none");
        expect(requestChunk).toHaveBeenCalledTimes(2);
    });

    it("returns ready structure tags joined by comma", () => {
        const requestChunk = vi.fn((chunkX: number, chunkY: number) =>
            Object.assign(createTestChunk(chunkX, chunkY, {ready: true}), {
                getStructurePieceAt: () => ({sprites: ["tree trunk", "tree canopy"]}),
            })
        );
        const view = new DefaultWorldGridView(requestChunk, () => undefined);

        expect(view.requestStructureTag(5, 6)).toBe("tree trunk, tree canopy");
    });

    it("never triggers chunk requests for ready-only reads", () => {
        const requestChunk = vi.fn(() => {
            throw new Error("should not request chunk");
        });
        const getLoadedChunk = vi.fn(() => undefined);
        const view = new DefaultWorldGridView(requestChunk, getLoadedChunk);

        expect(view.getReadyTile(0, 0)).toBeUndefined();
        expect(view.getReadyStructurePieceAt(0, 0)).toBeUndefined();
        expect(view.isChunkLoaded(0, 0)).toBe(false);
        expect(requestChunk).not.toHaveBeenCalled();
    });
});

