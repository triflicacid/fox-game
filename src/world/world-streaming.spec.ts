import {describe, expect, it, vi} from "vitest";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {World} from "./world";
import {createTestWorldDependencies, TestChunkGenerationWorker} from "./testing/create-test-world-dependencies";
import {createRecordingContext, createTestChunk} from "./testing/world-test-helpers";

describe("World drawing requests", () => {
    it("includes the camera view's exact far chunk boundary", () => {
        const worker = new TestChunkGenerationWorker(1);
        const world = new World(16, createTestWorldDependencies(1, {
            chunkWorkerClient: worker,
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        }));
        world.setMinimapEnabled(false);
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.draw(createRecordingContext([]), camera);

        expect(worker.requests).toEqual([
            {chunkX: 0, chunkY: 0},
            {chunkX: 1, chunkY: 0},
            {chunkX: 0, chunkY: 1},
            {chunkX: 1, chunkY: 1},
        ]);
    });

    it("draws void without requesting missing chunks when generation is disabled", () => {
        const events: string[] = [];
        const worker = new TestChunkGenerationWorker(1);
        const world = new World(16, createTestWorldDependencies(1, {chunkWorkerClient: worker}));
        world.setMinimapEnabled(false);
        world.setGenerationEnabled(false);
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.draw(createRecordingContext(events), camera);

        expect(worker.requests).toEqual([]);
        expect(events.filter((event) => event === "context:fillRect")).toHaveLength(4);
    });
});

describe("World streaming updates", () => {
    it("loads a two-chunk buffer, reorders only across focus chunks, and evicts outside it", () => {
        const worker = new TestChunkGenerationWorker(1);
        const chunkFactory = vi.fn((chunkX: number, chunkY: number) => createTestChunk(chunkX, chunkY));
        const world = new World(16, createTestWorldDependencies(1, {chunkWorkerClient: worker, chunkFactory}));
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.update(16, camera, true);

        expect(world.getLoadedChunkCount()).toBe(36);
        expect(chunkFactory).toHaveBeenCalledTimes(36);
        expect(new Set(worker.requests.map(({chunkX}) => chunkX))).toEqual(new Set([-2, -1, 0, 1, 2, 3]));
        expect(new Set(worker.requests.map(({chunkY}) => chunkY))).toEqual(new Set([-2, -1, 0, 1, 2, 3]));
        expect(worker.reorderings).toHaveLength(1);

        world.update(16, camera, true);
        expect(worker.reorderings).toHaveLength(1);

        camera.setCenter(new Vector2d(384, 128));
        world.update(16, camera, true);

        expect(worker.reorderings).toHaveLength(2);
        expect(world.getLoadedChunkCount()).toBe(36);
        expect(chunkFactory).toHaveBeenCalledTimes(42);
        expect(worker.requests.some(({chunkX}) => chunkX === -2)).toBe(true);
    });

    it("freezes loaded chunks and cancels pending generation when disabled", () => {
        const worker = new TestChunkGenerationWorker(1);
        const world = new World(16, createTestWorldDependencies(1, {
            chunkWorkerClient: worker,
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        }));
        const camera = new Camera(new Vector2d(128, 128), 256, 256);
        world.update(16, camera, true);
        expect(world.getLoadedChunkCount()).toBe(36);

        world.setGenerationEnabled(false);
        camera.setCenter(new Vector2d(2048, 2048));
        world.update(16, camera, true);

        expect(worker.cancelCount).toBe(1);
        expect(world.getLoadedChunkCount()).toBe(0);
    });
});

