import {describe, expect, it, vi} from "vitest";
import type {ReadonlyEntityCollection} from "../../entities/entity-collection";
import {MovableEntity} from "../../entities/movable-entity";
import {rectPolygon} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import {createTestMovableEntity} from "../testing/world-test-helpers";
import type {Chunk} from "../chunks/chunk";
import type {Tile} from "../tiles/tile";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import type {StructureResolver} from "./structure-resolver";
import {WorldCollisionSystem} from "./world-collision-system";

const TILE_SIZE = 16;

/** Builds a fake ready-only grid, defaulting every read to "nothing here". */
function fakeGrid(overrides: Partial<ReadyWorldGrid> = {}): ReadyWorldGrid {
    return {
        isChunkLoaded: () => false,
        getLoadedChunk: () => undefined,
        getReadyTile: () => undefined,
        getReadyStructurePieceAt: () => undefined,
        ...overrides,
    };
}

/** Wraps a single entity as the live entity set. */
function fakeEntities(entity: MovableEntity): ReadonlyEntityCollection {
    return {getEntities: () => [entity], getMainEntity: () => entity};
}

/** A structure resolver double: no piece in these tests carries collision, so neither method is ever called. */
const NOOP_STRUCTURE_RESOLVER = {} as StructureResolver;

describe("WorldCollisionSystem generating-chunk setting", () => {
    it("round-trips the can-move-onto-generating-chunks flag", () => {
        const system = new WorldCollisionSystem(fakeGrid(), fakeEntities(createTestMovableEntity()), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);

        expect(system.getCanMoveOntoGeneratingChunks()).toBe(false);
        system.setCanMoveOntoGeneratingChunks(true);
        expect(system.getCanMoveOntoGeneratingChunks()).toBe(true);
    });
});

describe("WorldCollisionSystem ground constraints", () => {
    it("returns an entity to its previous position when generation is disabled and its ground isn't loaded", () => {
        const events: string[] = [];
        const grid = fakeGrid({getLoadedChunk: (chunkX, chunkY) => (chunkX === 0 && chunkY === 0 ? ({} as Chunk) : undefined)});
        const entity = createTestMovableEntity({position: new Vector2d(300, 8), events});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);

        system.update(new Map([[entity, new Vector2d(8, 8)]]), false);

        expect(entity.getPosition()).toEqual(new Vector2d(8, 8));
        expect(events).toContain("entity:teleport:8,8");
    });

    it("blocks movement onto a generating chunk by default", () => {
        const grid = fakeGrid({getLoadedChunk: () => ({isReady: () => false}) as Chunk});
        const entity = createTestMovableEntity({position: new Vector2d(300, 8)});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);

        system.update(new Map([[entity, new Vector2d(8, 8)]]), true);

        expect(entity.getPosition()).toEqual(new Vector2d(8, 8));
    });

    it("permits movement onto a generating chunk once configured", () => {
        const grid = fakeGrid({getLoadedChunk: () => ({isReady: () => false}) as Chunk});
        const entity = createTestMovableEntity({position: new Vector2d(300, 8)});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);
        system.setCanMoveOntoGeneratingChunks(true);

        system.update(new Map([[entity, new Vector2d(8, 8)]]), true);

        expect(entity.getPosition()).toEqual(new Vector2d(300, 8));
    });

    it("skips an entity absent from the previous-position map", () => {
        const grid = fakeGrid();
        const entity = createTestMovableEntity({position: new Vector2d(300, 8)});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);

        system.update(new Map(), false);

        expect(entity.getPosition()).toEqual(new Vector2d(300, 8));
    });
});

describe("WorldCollisionSystem collision sweep", () => {
    it("checks a tile before its structure and stops after the first handled obstacle", () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const events: string[] = [];
        const tile = {
            groundType: "test ground",
            getCollision: (tileX: number, tileY: number) => {
                events.push(`tile:${tileX},${tileY}`);
                return {polygon: rectPolygon(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE), response: "solid" as const};
            },
        } as unknown as Tile;
        const grid = fakeGrid({
            getReadyTile: () => tile,
            getReadyStructurePieceAt: () => {
                events.push("structure");
                return undefined;
            },
        });
        const entity = createTestMovableEntity({position: new Vector2d(16, 16), moving: true, frameWidth: 32, frameHeight: 32});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);
        system.setCanMoveOntoGeneratingChunks(true);

        system.update(new Map([[entity, new Vector2d(16, 16)]]), true);

        expect(events).toEqual(["tile:0,0"]);
        vi.restoreAllMocks();
    });

    it("keeps the last collision until the entity moves again, then drops it once no obstacle overlaps", () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        let ready = true;
        let moving = true;
        const tile = {
            groundType: "test ground",
            getCollision: (tileX: number, tileY: number) => ready
                ? {polygon: rectPolygon(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE), response: "solid" as const}
                : undefined,
        } as unknown as Tile;
        const grid = fakeGrid({getReadyTile: () => tile});
        const entity = Object.assign(createTestMovableEntity({position: new Vector2d(16, 16), frameWidth: 32, frameHeight: 32}), {
            isMoving: () => moving,
        });
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);
        system.setCanMoveOntoGeneratingChunks(true);
        system.update(new Map([[entity, new Vector2d(16, 16)]]), true);
        expect(system.getDebugState()).toEqual({entityLabel: "test entity", obstacleLabel: 'tile "test ground" (0, 0)'});

        // No longer moving, and nothing collides this sweep - the earlier collision must still be reported.
        ready = false;
        moving = false;
        system.update(new Map([[entity, new Vector2d(16, 16)]]), true);
        expect(system.getDebugState()).toEqual({entityLabel: "test entity", obstacleLabel: 'tile "test ground" (0, 0)'});

        // Moving again with nothing to collide with clears the stale collision.
        moving = true;
        system.update(new Map([[entity, new Vector2d(16, 16)]]), true);
        expect(system.getDebugState()).toBeUndefined();

        vi.restoreAllMocks();
    });

    it("clears tracked collision state", () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const tile = {
            groundType: "test ground",
            getCollision: (tileX: number, tileY: number) => ({polygon: rectPolygon(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE), response: "solid" as const}),
        } as unknown as Tile;
        const grid = fakeGrid({getReadyTile: () => tile});
        const entity = createTestMovableEntity({position: new Vector2d(16, 16), moving: true, frameWidth: 32, frameHeight: 32});
        const system = new WorldCollisionSystem(grid, fakeEntities(entity), NOOP_STRUCTURE_RESOLVER, TILE_SIZE);
        system.setCanMoveOntoGeneratingChunks(true);
        system.update(new Map([[entity, new Vector2d(16, 16)]]), true);
        expect(system.getDebugState()).toBeDefined();

        system.clear();

        expect(system.getDebugState()).toBeUndefined();
        vi.restoreAllMocks();
    });
});
