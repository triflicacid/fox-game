import {describe, expect, it} from "vitest";
import {WorldDebugSnapshotBuilder} from "./world-debug-snapshot-builder";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import type {Chunk} from "../chunks/chunk";
import {Vector2d} from "../../geometry/vector2d";
import type {MovableEntity} from "../../entities/movable-entity";
import type {Camera} from "../../camera/camera";
import type {BiomeSummary} from "../generation/biome/biome";

/** Creates a minimal ready fake chunk. */
function makeChunk(chunkX: number, chunkY: number, biome: BiomeSummary | "" = "plains"): Chunk {
    return {
        getChunkX: () => chunkX,
        getChunkY: () => chunkY,
        getBiomeSummary: () => biome,
        getGenerationTimeMs: () => 0,
        isReady: () => true,
        getCacheState: () => "live",
    };
}

function makeGrid(chunks: Map<string, Chunk>): ReadyWorldGrid {
    const key = (x: number, y: number) => `${x},${y}`;
    return {
        isChunkLoaded: (x, y) => chunks.has(key(x, y)),
        getLoadedChunk: (x, y) => chunks.get(key(x, y)),
        getReadyTile: () => undefined,
        getReadyStructurePieceAt: () => undefined,
    };
}

function makeGeneratingGrid(chunks: Map<string, Chunk>): {requestChunk: (x: number, y: number) => Chunk; requestFeatureTag: () => "none"; requestStructureTag: () => "none"; requestTile: () => never} {
    return {
        requestChunk: (x, y) => chunks.get(`${x},${y}`) ?? makeChunk(x, y, ""),
        requestFeatureTag: () => "none",
        requestStructureTag: () => "none",
        requestTile: () => {throw new Error("not used");},
    };
}

function makeEntity(position = new Vector2d(8, 8)): MovableEntity {
    return {
        getPosition: () => position,
        getVelocity: () => Vector2d.ZERO,
        getDisplayName: () => "fox",
        getFacing: () => "south",
        getBoundingRect: () => ({x: position.x - 4, y: position.y - 4, w: 8, h: 8}),
    } as unknown as MovableEntity;
}

function makeCamera(): Camera {
    return {
        getCenter: () => new Vector2d(128, 128),
        getWidth: () => 256,
        getHeight: () => 256,
        getZoom: () => 1,
    } as Camera;
}

describe("WorldDebugSnapshotBuilder.getBiomeRegionSize", () => {
    it("returns the count of connected same-biome chunks", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "plains")],
            ["0,1", makeChunk(0, 1, "desert")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const result = builder.getBiomeRegionSize(0, 0, "plains");

        expect(result.count).toBe(2);
    });

    it("caches the result and returns it on a second call without re-running BFS", () => {
        let bfsCallCount = 0;
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const grid = makeGrid(chunks);
        const originalGet = grid.getLoadedChunk.bind(grid);
        grid.getLoadedChunk = (x, y) => { bfsCallCount++; return originalGet(x, y); };
        const builder = new WorldDebugSnapshotBuilder(16, grid, makeGeneratingGrid(chunks) as never);

        builder.getBiomeRegionSize(0, 0, "plains");
        bfsCallCount = 0;
        builder.getBiomeRegionSize(0, 0, "plains");

        expect(bfsCallCount).toBe(0);
    });

    it("recomputes after clearBiomeRegionCache", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "plains")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const before = builder.getBiomeRegionSize(0, 0, "plains");
        chunks.delete("1,0");
        builder.clearBiomeRegionCache();
        const after = builder.getBiomeRegionSize(0, 0, "plains");

        expect(before.count).toBe(2);
        expect(after.count).toBe(1);
    });

    it("recomputes when the anchor chunk has been evicted", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "plains")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        builder.getBiomeRegionSize(0, 0, "plains");
        chunks.delete("0,0");

        const result = builder.getBiomeRegionSize(1, 0, "plains");

        expect(result.count).toBe(1);
    });

    it("marks the region as partial when a neighbour is unloaded", () => {
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const result = builder.getBiomeRegionSize(0, 0, "plains");

        expect(result.isPartial).toBe(true);
    });

    it("is not partial when all neighbours are loaded with different biomes", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "desert")],
            ["-1,0", makeChunk(-1, 0, "desert")],
            ["0,1", makeChunk(0, 1, "desert")],
            ["0,-1", makeChunk(0, -1, "desert")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const result = builder.getBiomeRegionSize(0, 0, "plains");

        expect(result.isPartial).toBe(false);
    });
});

describe("WorldDebugSnapshotBuilder.getDistanceToBiomeEdge", () => {
    it("returns distance 1 when an adjacent chunk has a different biome", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "desert")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const result = builder.getDistanceToBiomeEdge(0, 0, "plains");

        expect(result?.distance).toBe(1);
    });

    it("returns undefined when no different-biome chunk is within search range", () => {
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        expect(builder.getDistanceToBiomeEdge(0, 0, "plains")).toBeUndefined();
    });

    it("returns a compass direction", () => {
        const chunks = new Map([
            ["0,0", makeChunk(0, 0, "plains")],
            ["1,0", makeChunk(1, 0, "desert")],
        ]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const result = builder.getDistanceToBiomeEdge(0, 0, "plains");

        expect(result?.direction).toBeTypeOf("string");
        if (!result) {
            throw new Error("expected a biome edge result");
        }
        expect(result.direction.length).toBeGreaterThan(0);
    });
});

describe("WorldDebugSnapshotBuilder.build", () => {
    it("returns DebugHudData with correct camera and entity fields", () => {
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);
        const entity = makeEntity(new Vector2d(24, 32));

        const data = builder.build(
            makeCamera(),
            entity,
            {spectating: false, spectatorVelocity: Vector2d.ZERO, actualFps: 60, targetFps: 60},
            3, 5, 1, 12, 10,
            undefined,
        );

        expect(data.entityX).toBeCloseTo(24);
        expect(data.entityY).toBeCloseTo(32);
        expect(data.actualFps).toBe(60);
        expect(data.collision).toBe(false);
    });

    it("reports collision true when lastCollision is provided", () => {
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const data = builder.build(
            makeCamera(),
            makeEntity(),
            {spectating: false, spectatorVelocity: Vector2d.ZERO, actualFps: 0, targetFps: undefined},
            0, 0, 0, 0, 0,
            {entityLabel: "fox", obstacleLabel: "tile \"water\" (0, 0)"},
        );

        expect(data.collision).toBe(true);
        expect(data.collisionEntity).toBe("fox");
    });

    it("uses spectatorVelocity for the velocity fields while spectating", () => {
        const chunks = new Map([["0,0", makeChunk(0, 0, "plains")]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);
        const spectatorVelocity = new Vector2d(3, 4);

        const data = builder.build(
            makeCamera(),
            makeEntity(),
            {spectating: true, spectatorVelocity, actualFps: 0, targetFps: undefined},
            0, 0, 0, 0, 0,
            undefined,
        );

        expect(data.velocityX).toBeCloseTo(3);
        expect(data.velocityY).toBeCloseTo(4);
        expect(data.velocityLabel).toBe("Spectator");
    });

    it("reports generating biome when the player chunk is not yet ready", () => {
        const generatingChunk: Chunk = {
            getChunkX: () => 0,
            getChunkY: () => 0,
            getBiomeSummary: () => "",
            getGenerationTimeMs: () => 0,
            isReady: () => false,
            getCacheState: () => "live",
        };
        const chunks = new Map([["0,0", generatingChunk]]);
        const builder = new WorldDebugSnapshotBuilder(16, makeGrid(chunks), makeGeneratingGrid(chunks) as never);

        const data = builder.build(
            makeCamera(),
            makeEntity(),
            {spectating: false, spectatorVelocity: Vector2d.ZERO, actualFps: 0, targetFps: undefined},
            0, 0, 0, 0, 0,
            undefined,
        );

        expect(data.chunkBiome).toBe("generating...");
        expect(data.chunkCacheState).toBe("pending");
    });
});


