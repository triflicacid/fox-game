import {describe, expect, it, vi} from "vitest";
import {Camera} from "../../camera/camera";
import {Vector2d} from "../../geometry/vector2d";
import {TestChunkGenerationWorker} from "../testing/create-test-world-dependencies";
import {createTestChunk} from "../testing/world-test-helpers";
import type {ChunkGenerationResult} from "../generation/chunk/chunk-worker-protocol";
import type {ChunkSpriteSheets} from "../rendering/chunk-sprite-sheets";
import type {DrawableChunk} from "./chunk";
import {ChunkStore} from "./chunk-store";
import {ChunkStreamingManager} from "./chunk-streaming-manager";

const TILE_SIZE = 16;
const FAKE_SPRITE_SHEETS = {} as ChunkSpriteSheets;

/** Builds a manager over a fresh store and the given (or a fresh) worker. */
function createManager(worker: TestChunkGenerationWorker = new TestChunkGenerationWorker(1), store = new ChunkStore<DrawableChunk>()): ChunkStreamingManager {
    return new ChunkStreamingManager(store, worker, (chunkX, chunkY) => createTestChunk(chunkX, chunkY), FAKE_SPRITE_SHEETS, TILE_SIZE, 1);
}

describe("ChunkStreamingManager.requestChunk", () => {
    it("requests and constructs a chunk once, then reuses it for the same coordinate", () => {
        const worker = new TestChunkGenerationWorker(1);
        const chunkFactory = vi.fn((chunkX: number, chunkY: number) => createTestChunk(chunkX, chunkY));
        const store = new ChunkStore<DrawableChunk>();
        const manager = new ChunkStreamingManager(store, worker, chunkFactory, FAKE_SPRITE_SHEETS, TILE_SIZE, 1);

        const first = manager.requestChunk(2, 3);
        const second = manager.requestChunk(2, 3);

        expect(first).toBe(second);
        expect(chunkFactory).toHaveBeenCalledOnce();
        expect(worker.requests).toEqual([{chunkX: 2, chunkY: 3}]);
        expect(store.get(2, 3)).toBe(first);
    });

    it("records generation time metrics once the worker resolves", async () => {
        const worker = new TestChunkGenerationWorker(1);
        let resolveGeneration!: (result: ChunkGenerationResult) => void;
        const generation = new Promise<ChunkGenerationResult>((resolve) => {
            resolveGeneration = resolve;
        });
        vi.spyOn(worker, "requestChunk").mockReturnValue(generation);
        const manager = createManager(worker);

        manager.requestChunk(0, 0);
        expect(manager.getLatestGenerationTimeMs()).toBe(0);
        expect(manager.getAverageGenerationTimeMs()).toBe(0);

        resolveGeneration({chunkX: 0, chunkY: 0, biomeSummary: "plains", tiles: [], props: [], generationTimeMs: 42});
        await generation;

        expect(manager.getLatestGenerationTimeMs()).toBe(42);
        expect(manager.getAverageGenerationTimeMs()).toBe(42);
    });

    it("does not count a rejected generation towards metrics", async () => {
        const worker = new TestChunkGenerationWorker(1);
        let rejectGeneration!: (reason: unknown) => void;
        const generation = new Promise<ChunkGenerationResult>((_resolve, reject) => {
            rejectGeneration = reject;
        });
        vi.spyOn(worker, "requestChunk").mockReturnValue(generation);
        const manager = createManager(worker);

        manager.requestChunk(0, 0);
        rejectGeneration(new Error("worker terminated"));
        await generation.catch(() => undefined);

        expect(manager.getLatestGenerationTimeMs()).toBe(0);
        expect(manager.getAverageGenerationTimeMs()).toBe(0);
    });
});

describe("ChunkStreamingManager.update", () => {
    it("loads a buffer around the focus, reorders only across focus chunks, and evicts drift", () => {
        const worker = new TestChunkGenerationWorker(1);
        const chunkFactory = vi.fn((chunkX: number, chunkY: number) => createTestChunk(chunkX, chunkY));
        const manager = new ChunkStreamingManager(new ChunkStore(), worker, chunkFactory, FAKE_SPRITE_SHEETS, TILE_SIZE, 1);
        const camera = new Camera(new Vector2d(128, 128), 256, 256);
        const focus = manager.getGenerationFocus(camera, false, () => new Vector2d(128, 128));

        manager.update(camera, focus);
        manager.reorderQueueIfFocusMoved(focus);

        expect(manager.getLoadedChunkCount()).toBe(36);
        expect(chunkFactory).toHaveBeenCalledTimes(36);
        expect(new Set(worker.requests.map(({chunkX}) => chunkX))).toEqual(new Set([-2, -1, 0, 1, 2, 3]));
        expect(worker.reorderings).toHaveLength(1);

        manager.update(camera, focus);
        manager.reorderQueueIfFocusMoved(focus);
        expect(worker.reorderings).toHaveLength(1);

        camera.setCenter(new Vector2d(384, 128));
        const movedFocus = manager.getGenerationFocus(camera, false, () => new Vector2d(384, 128));
        manager.update(camera, movedFocus);
        manager.reorderQueueIfFocusMoved(movedFocus);

        expect(worker.reorderings).toHaveLength(2);
        expect(manager.getLoadedChunkCount()).toBe(36);
        expect(chunkFactory).toHaveBeenCalledTimes(42);
        expect(worker.requests.some(({chunkX}) => chunkX === -2)).toBe(true);
    });

    it("does not request or evict chunks while generation is disabled", () => {
        const worker = new TestChunkGenerationWorker(1);
        const chunkFactory = vi.fn((chunkX: number, chunkY: number) => createTestChunk(chunkX, chunkY));
        const manager = new ChunkStreamingManager(new ChunkStore(), worker, chunkFactory, FAKE_SPRITE_SHEETS, TILE_SIZE, 1);
        manager.setGenerationEnabled(false);
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        manager.update(camera, new Vector2d(128, 128));

        expect(chunkFactory).not.toHaveBeenCalled();
        expect(manager.getLoadedChunkCount()).toBe(0);
    });
});

describe("ChunkStreamingManager generation-enabled setting", () => {
    it("cancels pending generation and drops unready chunks when disabled", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = new ChunkStreamingManager(new ChunkStore(), worker, (chunkX, chunkY) => createTestChunk(chunkX, chunkY), FAKE_SPRITE_SHEETS, TILE_SIZE, 1);
        const camera = new Camera(new Vector2d(128, 128), 256, 256);
        manager.update(camera, manager.getGenerationFocus(camera, false, () => new Vector2d(128, 128)));
        expect(manager.getLoadedChunkCount()).toBe(36);

        manager.setGenerationEnabled(false);

        expect(worker.cancelCount).toBe(1);
        expect(manager.getLoadedChunkCount()).toBe(0);
    });
});

describe("ChunkStreamingManager chunk lifecycle", () => {
    it("unloads a single chunk", () => {
        const store = new ChunkStore<DrawableChunk>();
        const manager = createManager(undefined, store);
        manager.requestChunk(1, 1);

        manager.unloadChunk(1, 1);

        expect(manager.getLoadedChunkCount()).toBe(0);
    });

    it("reloadAll cancels pending requests and clears every loaded chunk", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = createManager(worker);
        manager.requestChunk(0, 0);

        manager.reloadAll();

        expect(worker.cancelCount).toBe(1);
        expect(manager.getLoadedChunkCount()).toBe(0);
    });
});

describe("ChunkStreamingManager.getGenerationFocus", () => {
    it("focuses the camera center while spectating, otherwise the main entity's position", () => {
        const manager = createManager();
        const camera = new Camera(new Vector2d(50, 60), 100, 100);
        const entityPosition = new Vector2d(10, 20);

        expect(manager.getGenerationFocus(camera, true, () => entityPosition)).toEqual(camera.getCenter());
        expect(manager.getGenerationFocus(camera, false, () => entityPosition)).toEqual(entityPosition);
    });
});

describe("ChunkStreamingManager debug knobs", () => {
    it("propagates the minimum generation delay to the worker", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = createManager(worker);

        manager.setMinGenerationDelayMs(500);

        expect(manager.getMinGenerationDelayMs()).toBe(500);
        expect(worker.minimumDelayMs).toBe(500);
    });

    it("propagates a seed change to the worker", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = createManager(worker);

        manager.setWorldSeed(99);

        expect(manager.getWorldSeed()).toBe(99);
        expect(worker.seedChanges).toEqual([99]);
    });

    it("exposes the pending queue and its ordering for debugging", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = createManager(worker);
        manager.requestChunk(0, 0);
        manager.requestChunk(1, 0);

        expect(manager.getPendingChunks()).toEqual([{chunkX: 0, chunkY: 0}, {chunkX: 1, chunkY: 0}]);
        expect(manager.getQueuePosition(1, 0)).toBe(1);

        manager.reorderPending([{chunkX: 1, chunkY: 0}, {chunkX: 0, chunkY: 0}]);

        expect(manager.getQueuePosition(1, 0)).toBe(0);
    });
});

describe("ChunkStreamingManager.dispose", () => {
    it("terminates the underlying worker", () => {
        const worker = new TestChunkGenerationWorker(1);
        const manager = createManager(worker);

        manager.dispose();

        expect(worker.terminated).toBe(true);
    });
});
