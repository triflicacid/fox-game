import {afterEach, describe, expect, it, vi} from "vitest";
import {Camera} from "../camera/camera";
import type {Effect} from "../effects/effect";
import {Vector2d} from "../geometry/vector2d";
import {StructureResolver} from "./collision/structure-resolver";
import type {ChunkSpriteSheets} from "./rendering/chunk-sprite-sheets";
import {World} from "./world";
import type {ChunkSpriteSheetsFactory} from "./world-dependencies";
import {
    createTestWorldDependencies,
    TestChunkGenerationWorker,
    TestTerrainGenerationSource
} from "./testing/create-test-world-dependencies";
import {createRecordingContext, createTestChunk, createTestMovableEntity} from "./testing/world-test-helpers";

/** Restores globals replaced by individual characterization tests. */
afterEach(() => {
    vi.restoreAllMocks();
});

describe("World construction", () => {
    it("requires and retains the complete injected dependency graph", () => {
        let suppliedResolver: StructureResolver | undefined;
        const chunkSpriteSheetsFactory: ChunkSpriteSheetsFactory = (structureResolver): ChunkSpriteSheets => {
            suppliedResolver = structureResolver;
            return {
                backgroundTile: {} as ChunkSpriteSheets["backgroundTile"],
                animatedBackgroundTile: {} as ChunkSpriteSheets["animatedBackgroundTile"],
                getStructureSpriteBitmap: (sprite) => structureResolver.getSpriteBitmap(sprite),
                getStructureCollisionPolygon: (sprite, centerX, centerY, tileSize) =>
                    structureResolver.collisionPolygonForSprite(sprite, centerX, centerY, tileSize),
            };
        };
        const dependencies = createTestWorldDependencies(42, {chunkSpriteSheetsFactory});
        const findSheet = vi.spyOn(dependencies.structureSheetRegistry, "findSheet");
        const setMinGenerationDelayMs = vi.spyOn(dependencies.chunkWorkerClient, "setMinGenerationDelayMs");

        const world = new World(16, dependencies);

        expect(world.tileSize).toBe(16);
        expect(world.getWorldSeed()).toBe(42);
        world.getChunkStreamingManager().setMinGenerationDelayMs(500);
        expect(setMinGenerationDelayMs).toHaveBeenCalledWith(500);
        expect(suppliedResolver).toBeInstanceOf(StructureResolver);
        void suppliedResolver?.getSpriteBitmap("some-sprite");
        expect(findSheet).toHaveBeenCalledWith("some-sprite");
    });

    it("uses the worker result and injected factory once per chunk coordinate", () => {
        const generation = new Promise<never>(() => undefined);
        const worker = new TestChunkGenerationWorker(1);
        const request = vi.spyOn(worker, "requestChunk").mockReturnValue(generation);
        const chunk = createTestChunk(3, -2);
        const chunkFactory = vi.fn(() => chunk);
        const dependencies = createTestWorldDependencies(1, {chunkWorkerClient: worker, chunkFactory});
        const world = new World(16, dependencies);
        const camera = new Camera(new Vector2d(1023, -257), 1, 1);
        world.setMinimapEnabled(false);

        world.draw({
            canvas: {width: 1, height: 1},
            save: () => undefined,
            restore: () => undefined,
            scale: () => undefined,
            fillRect: () => undefined,
            drawImage: () => undefined,
        } as unknown as CanvasRenderingContext2D, camera);
        world.draw({
            canvas: {width: 1, height: 1},
            save: () => undefined,
            restore: () => undefined,
            scale: () => undefined,
            fillRect: () => undefined,
            drawImage: () => undefined,
        } as unknown as CanvasRenderingContext2D, camera);

        expect(request).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledWith(3, -2);
        expect(chunkFactory).toHaveBeenCalledOnce();
        expect(chunkFactory).toHaveBeenCalledWith(3, -2, generation, expect.any(Object), 16);
    });
});

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

describe("World seed", () => {
    it("propagates changes without dropping loaded chunks", () => {
        const generator = new TestTerrainGenerationSource(10);
        const worker = new TestChunkGenerationWorker(10);
        const dependencies = createTestWorldDependencies(10, {chunkGenerator: generator, chunkWorkerClient: worker});
        const world = new World(16, dependencies);
        world.setMinimapEnabled(false);
        world.draw({
            canvas: {width: 1, height: 1},
            save: () => undefined,
            restore: () => undefined,
            scale: () => undefined,
            fillRect: () => undefined,
            drawImage: () => undefined,
        } as unknown as CanvasRenderingContext2D, new Camera(new Vector2d(8, 8), 1, 1));

        world.setWorldSeed(99);

        expect(world.getWorldSeed()).toBe(99);
        expect(generator.seedChanges).toEqual([99]);
        expect(worker.seedChanges).toEqual([99]);
        expect(world.getChunkStreamingManager().getLoadedChunkCount()).toBe(1);
    });

    it("refreshes through the shared random seed function", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.25);
        const generator = new TestTerrainGenerationSource(1);
        const worker = new TestChunkGenerationWorker(1);
        const world = new World(16, createTestWorldDependencies(1, {chunkGenerator: generator, chunkWorkerClient: worker}));
        const expectedSeed = Math.floor(0.25 * 0xffffffff);

        world.refreshWorldSeed();

        expect(world.getWorldSeed()).toBe(expectedSeed);
        expect(generator.seedChanges).toEqual([expectedSeed]);
        expect(worker.seedChanges).toEqual([expectedSeed]);
    });
});

describe("World update orchestration", () => {
    it("updates entities, effects, streaming, and queue order in sequence", () => {
        const events: string[] = [];
        const worker = new TestChunkGenerationWorker(1);
        const originalRequestChunk = worker.requestChunk.bind(worker);
        vi.spyOn(worker, "requestChunk").mockImplementation((chunkX, chunkY) => {
            events.push("stream:request");
            return originalRequestChunk(chunkX, chunkY);
        });
        const originalReorderPending = worker.reorderPending.bind(worker);
        vi.spyOn(worker, "reorderPending").mockImplementation((order) => {
            events.push("stream:reorder");
            originalReorderPending(order);
        });
        const world = new World(16, createTestWorldDependencies(1, {
            chunkWorkerClient: worker,
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        }));
        world.setCanMoveOntoGeneratingChunks(true);
        world.setMainEntity(createTestMovableEntity({events}));
        world.registerEffect({
            update: () => events.push("effect:update"),
            isExpired: () => false,
            draw: () => undefined,
        } as Effect);

        world.update(16, new Camera(new Vector2d(8, 8), 16, 16), true);

        expect(events.indexOf("entity:update")).toBeLessThan(events.indexOf("effect:update"));
        expect(events.indexOf("effect:update")).toBeLessThan(events.indexOf("stream:request"));
        expect(events.lastIndexOf("stream:request")).toBeLessThan(events.indexOf("stream:reorder"));
    });
});








