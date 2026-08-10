import {describe, expect, it, vi} from "vitest";
import {Camera} from "../camera/camera";
import {rectPolygon} from "../geometry/convex-polygon";
import {Vector2d} from "../geometry/vector2d";
import type {Tile} from "./tile";
import {World} from "./world";
import {createTestWorldDependencies} from "./testing/create-test-world-dependencies";
import {createTestChunk, createTestMovableEntity} from "./testing/world-test-helpers";

describe("World movement constraints", () => {
    it("returns an entity to ready ground when generation is disabled", () => {
        const world = new World(16, createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY, {ready: chunkX === 0 && chunkY === 0}),
        }));
        world.getChunk(0, 0);
        world.setGenerationEnabled(false);
        const entity = createTestMovableEntity({position: new Vector2d(8, 8), nextPosition: new Vector2d(300, 8), moving: true});
        world.setMainEntity(entity);

        world.update(16, new Camera(new Vector2d(8, 8), 16, 16), true);

        expect(entity.getPosition()).toEqual(new Vector2d(8, 8));
    });

    it("blocks generating ground by default but permits it when configured", () => {
        const camera = new Camera(new Vector2d(8, 8), 16, 16);
        const blockedWorld = new World(16, createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        }));
        const blockedEntity = createTestMovableEntity({position: new Vector2d(8, 8), nextPosition: new Vector2d(300, 8), moving: true});
        blockedWorld.setMainEntity(blockedEntity);

        blockedWorld.update(16, camera, true);
        expect(blockedEntity.getPosition()).toEqual(new Vector2d(8, 8));

        const allowedWorld = new World(16, createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        }));
        allowedWorld.setCanMoveOntoGeneratingChunks(true);
        const allowedEntity = createTestMovableEntity({position: new Vector2d(8, 8), nextPosition: new Vector2d(300, 8), moving: true});
        allowedWorld.setMainEntity(allowedEntity);

        allowedWorld.update(16, camera, true);
        expect(allowedEntity.getPosition()).toEqual(new Vector2d(300, 8));
    });
});

describe("World collision sweep", () => {
    it("checks a tile before its structure and stops after the first handled obstacle", () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const events: string[] = [];
        const tile = {
            groundType: "test ground",
            getCollision: (tileX: number, tileY: number) => {
                events.push(`tile:${tileX},${tileY}`);
                return {
                    polygon: rectPolygon(tileX * 16, tileY * 16, 16, 16),
                    response: "solid" as const,
                };
            },
        } as unknown as Tile;
        const world = new World(16, createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => Object.assign(createTestChunk(chunkX, chunkY, {ready: true}), {
                getTile: () => tile,
                getStructurePieceAt: () => {
                    events.push("structure");
                    return undefined;
                },
            }),
        }));
        world.setCanMoveOntoGeneratingChunks(true);
        const entity = createTestMovableEntity({
            position: new Vector2d(16, 16),
            nextPosition: new Vector2d(16, 16),
            moving: true,
            frameWidth: 32,
            frameHeight: 32,
        });
        world.setMainEntity(entity);

        world.update(16, new Camera(new Vector2d(16, 16), 16, 16), true);

        expect(events).toEqual(["tile:0,0"]);
    });
});


