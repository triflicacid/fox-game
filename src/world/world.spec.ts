import {afterEach, describe, expect, it, vi} from "vitest";
import {Camera} from "../camera/camera";
import type {Effect} from "../effects/effect";
import {Vector2d} from "../geometry/vector2d";
import type {Tile} from "./tiles/tile";
import type {ChunkSpriteSheets} from "./rendering/chunk-sprite-sheets";
import {World} from "./world";
import type {ChunkSpriteSheetsFactory} from "./world-dependencies";
import {
    createTestWorldDependencies,
    TestChunkGenerationWorker,
    TestTerrainGenerationSource
} from "./testing/create-test-world-dependencies";
import {createTestChunk, createTestMovableEntity} from "./testing/world-test-helpers";

/** Restores globals replaced by individual characterization tests. */
afterEach(() => {
    vi.restoreAllMocks();
});

describe("World construction", () => {
    it("requires and retains the complete injected dependency graph", () => {
        let suppliedRegistry: unknown;
        let suppliedCollisionLookup: unknown;
        const chunkSpriteSheetsFactory: ChunkSpriteSheetsFactory = (registry, collisionLookup): ChunkSpriteSheets => {
            suppliedRegistry = registry;
            suppliedCollisionLookup = collisionLookup;
            return {
                backgroundTile: {} as ChunkSpriteSheets["backgroundTile"],
                animatedBackgroundTile: {} as ChunkSpriteSheets["animatedBackgroundTile"],
                getStructureSpriteBitmap: () => new Promise(() => undefined),
                getStructureCollisionPolygon: collisionLookup,
            };
        };
        const dependencies = createTestWorldDependencies(42, {chunkSpriteSheetsFactory});

        const world = new World(16, dependencies);

        expect(world.tileSize).toBe(16);
        expect(world.getWorldSeed()).toBe(42);
        expect(world.getChunkWorkerClient()).toBe(dependencies.chunkWorkerClient);
        expect(suppliedRegistry).toBe(dependencies.structureSheetRegistry);
        expect(suppliedCollisionLookup).toBeTypeOf("function");
    });

    it("uses the worker result and injected factory once per chunk coordinate", () => {
        const generation = new Promise<never>(() => undefined);
        const worker = new TestChunkGenerationWorker(1);
        const request = vi.spyOn(worker, "requestChunk").mockReturnValue(generation);
        const chunk = createTestChunk(3, -2);
        const chunkFactory = vi.fn(() => chunk);
        const dependencies = createTestWorldDependencies(1, {chunkWorkerClient: worker, chunkFactory});
        const world = new World(16, dependencies);

        expect(world.getChunk(3, -2)).toBe(chunk);
        expect(world.getChunk(3, -2)).toBe(chunk);
        expect(request).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledWith(3, -2);
        expect(chunkFactory).toHaveBeenCalledOnce();
        expect(chunkFactory).toHaveBeenCalledWith(3, -2, generation, expect.any(Object), 16);
    });
});

describe("World seed", () => {
    it("propagates changes without dropping loaded chunks", () => {
        const generator = new TestTerrainGenerationSource(10);
        const worker = new TestChunkGenerationWorker(10);
        const dependencies = createTestWorldDependencies(10, {chunkGenerator: generator, chunkWorkerClient: worker});
        const world = new World(16, dependencies);
        world.getChunk(0, 0);

        world.setWorldSeed(99);

        expect(world.getWorldSeed()).toBe(99);
        expect(generator.seedChanges).toEqual([99]);
        expect(worker.seedChanges).toEqual([99]);
        expect(world.getLoadedChunkCount()).toBe(1);
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

describe("World.tileToChunk", () => {
    it.each([
        [-1, -1, -1, -1],
        [-16, -16, -1, -1],
        [-17, -17, -2, -2],
        [0, 0, 0, 0],
        [15, 15, 0, 0],
        [16, 16, 1, 1],
    ])("maps tile (%i, %i) to chunk (%i, %i)", (tileX, tileY, chunkX, chunkY) => {
        expect(World.tileToChunk(tileX, tileY)).toEqual({chunkX, chunkY});
    });
});

describe("World dominant labels", () => {
    it("breaks equal counts in favor of the first tile encountered", () => {
        const world = new World(16, createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => Object.assign(createTestChunk(chunkX, chunkY, {ready: true}), {
                getTile: (localX: number) => ({
                    featureTag: localX === 0 ? "lake.shallow" : "oasis.shallow",
                }) as Tile,
                getStructurePieceAt: (tileX: number) => ({
                    sprites: [tileX === 0 ? "first structure" : "second structure"],
                }),
            }),
        }));

        expect(world.getDominantFeatureLabel(0, 0, 32, 16)).toBe("lake.shallow");
        expect(world.getDominantStructureLabel(0, 0, 32, 16)).toBe("first structure");
    });
});






