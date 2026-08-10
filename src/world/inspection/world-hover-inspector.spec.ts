import {describe, expect, it} from "vitest";
import {WorldHoverInspector} from "./world-hover-inspector";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import type {WorldGenerationView} from "../generation/world-generation-view";
import type {Entity} from "../../entities/entity";
import type {MinimapData} from "../../minimap/minimap";
import {Minimap} from "../../minimap/minimap";
import {Vector2d} from "../../geometry/vector2d";
import {MINIMAP_CONFIG} from "../../minimap/minimap-config";

function makeView(biome = "plains"): WorldGenerationView {
    return {
        setSeed: () => undefined,
        getFieldNames: () => [],
        getSample: () => undefined,
        getField: () => undefined,
        resolveBiomeTagAt: () => biome as never,
        getStructures: () => [],
    } as unknown as WorldGenerationView;
}

function makeGrid(overrides: Partial<ReadyWorldGrid> = {}): ReadyWorldGrid {
    return {
        isChunkLoaded: () => false,
        getLoadedChunk: () => undefined,
        getReadyTile: () => undefined,
        getReadyStructurePieceAt: () => undefined,
        ...overrides,
    } as ReadyWorldGrid;
}

describe("WorldHoverInspector.getTileHoverInfo", () => {
    it("returns undefined when the tile chunk is not ready", () => {
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => []);

        expect(inspector.getTileHoverInfo(0, 0, 0)).toBeUndefined();
    });

    it("returns hover data when the tile is ready", () => {
        const fakeTile = {
            biomeTag: "plains",
            featureTag: "none",
            getDisplayGroundType: (animationMs: number) => {
                void animationMs;
                return "grass";
            },
            getCollision: () => undefined,
            getAnimationInfo: () => undefined,
        };
        const grid = makeGrid({getReadyTile: () => fakeTile as never, getReadyStructurePieceAt: () => undefined});
        const inspector = new WorldHoverInspector(16, grid, makeView(), () => []);

        const info = inspector.getTileHoverInfo(3, 7, 100);

        expect(info).toBeDefined();
        if (!info) {
            throw new Error("expected hover info");
        }
        expect(info.tileX).toBe(3);
        expect(info.tileY).toBe(7);
        expect(info.groundType).toBe("grass");
        expect(info.biomeTag).toBe("plains");
    });

    it("includes structure hover info when a piece occupies the tile", () => {
        const fakeTile = {
            biomeTag: "plains",
            featureTag: "none",
            getDisplayGroundType: () => "grass",
            getCollision: () => undefined,
            getAnimationInfo: () => undefined,
        };
        const fakePiece = {
            sprites: ["tree.trunk"],
            structureId: "tree",
            layer: "background" as const,
            collision: "push" as const,
        };
        const grid = makeGrid({
            getReadyTile: () => fakeTile as never,
            getReadyStructurePieceAt: () => fakePiece as never,
        });
        const inspector = new WorldHoverInspector(16, grid, makeView(), () => []);

        const info = inspector.getTileHoverInfo(0, 0, 0);

        expect(info?.structure).toBeDefined();
        if (!info?.structure) {
            throw new Error("expected structure hover info");
        }
        expect(info.structure.structureId).toBe("tree");
        expect(info.structure.collision).toBe("push");
    });

    it("sets structure.collision to undefined for non-collidable pieces", () => {
        const fakeTile = {
            biomeTag: "plains", featureTag: "none",
            getDisplayGroundType: () => "grass", getCollision: () => undefined, getAnimationInfo: () => undefined,
        };
        const fakePiece = {sprites: ["deco"], structureId: "deco", layer: "background" as const, collision: "none" as const};
        const grid = makeGrid({
            getReadyTile: () => fakeTile as never,
            getReadyStructurePieceAt: () => fakePiece as never,
        });
        const inspector = new WorldHoverInspector(16, grid, makeView(), () => []);

        const info = inspector.getTileHoverInfo(0, 0, 0);

        expect(info?.structure?.collision).toBeUndefined();
    });
});

describe("WorldHoverInspector.getMinimapHoverInfo", () => {
    it("returns undefined when no minimap data has been set", () => {
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => []);

        expect(inspector.getMinimapHoverInfo(0, 0, 512)).toBeUndefined();
    });

    it("returns undefined for a screen point outside the minimap box", () => {
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => []);
        const data: MinimapData = {
            centerTile: new Vector2d(0, 0),
            marker: {kind: "spectator"},
            worldTilesPerPixel: MINIMAP_CONFIG.worldTilesPerPixel,
            modeKey: "biome",
            sampleColor: () => [0, 0, 0],
        };
        inspector.setLastMinimapData(data);

        expect(inspector.getMinimapHoverInfo(0, 0, 512)).toBeUndefined();
    });

    it("returns biome info for a point inside the minimap box", () => {
        const canvasWidth = 512;
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView("desert"), () => []);
        const data: MinimapData = {
            centerTile: new Vector2d(0, 0),
            marker: {kind: "spectator"},
            worldTilesPerPixel: MINIMAP_CONFIG.worldTilesPerPixel,
            modeKey: "biome",
            sampleColor: () => [0, 0, 0],
        };
        inspector.setLastMinimapData(data);
        const hoverX = Minimap.getBoxLeft(canvasWidth) + 1;
        const hoverY = MINIMAP_CONFIG.margin + 1;

        const info = inspector.getMinimapHoverInfo(hoverX, hoverY, canvasWidth);

        expect(info).toBeDefined();
        if (!info) {
            throw new Error("expected minimap hover info");
        }
        expect(info.biomeTag).toBe("desert");
    });

    it("clears hover data when setLastMinimapData receives undefined", () => {
        const canvasWidth = 512;
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => []);
        const data: MinimapData = {
            centerTile: new Vector2d(0, 0),
            marker: {kind: "spectator"},
            worldTilesPerPixel: MINIMAP_CONFIG.worldTilesPerPixel,
            modeKey: "biome",
            sampleColor: () => [0, 0, 0],
        };
        inspector.setLastMinimapData(data);
        inspector.setLastMinimapData(undefined);

        const hoverX = Minimap.getBoxLeft(canvasWidth) + 1;
        const hoverY = MINIMAP_CONFIG.margin + 1;
        expect(inspector.getMinimapHoverInfo(hoverX, hoverY, canvasWidth)).toBeUndefined();
    });
});

describe("WorldHoverInspector.getEntityHoverInfo", () => {
    it("returns undefined when no entities are registered", () => {
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => []);

        expect(inspector.getEntityHoverInfo(0, 0)).toBeUndefined();
    });

    it("returns info for an entity whose rect contains the point", () => {
        const entity: Partial<Entity> = {
            getBoundingRect: () => ({x: 10, y: 10, w: 20, h: 20}),
            getPosition: () => new Vector2d(20, 20),
            getStatus: () => "idle",
            getRegistryId: () => "sprite#0",
        };
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => [entity as Entity]);

        const info = inspector.getEntityHoverInfo(15, 15);

        expect(info).toBeDefined();
        if (!info) {
            throw new Error("expected entity hover info");
        }
        expect(info.name).toBe("sprite#0");
        expect(info.x).toBe(20);
        expect(info.y).toBe(20);
    });

    it("returns undefined for a point outside every entity", () => {
        const entity: Partial<Entity> = {
            getBoundingRect: () => ({x: 10, y: 10, w: 20, h: 20}),
            getPosition: () => new Vector2d(20, 20),
            getStatus: () => "idle",
            getRegistryId: () => "sprite#0",
        };
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => [entity as Entity]);

        expect(inspector.getEntityHoverInfo(0, 0)).toBeUndefined();
    });

    it("tests topmost (last-registered) entity first", () => {
        const front: Partial<Entity> = {
            getBoundingRect: () => ({x: 0, y: 0, w: 20, h: 20}),
            getPosition: () => new Vector2d(10, 10),
            getStatus: () => "idle",
            getRegistryId: () => "front#0",
        };
        const back: Partial<Entity> = {
            getBoundingRect: () => ({x: 0, y: 0, w: 20, h: 20}),
            getPosition: () => new Vector2d(10, 10),
            getStatus: () => "idle",
            getRegistryId: () => "back#0",
        };
        const inspector = new WorldHoverInspector(16, makeGrid(), makeView(), () => [back as Entity, front as Entity]);

        const info = inspector.getEntityHoverInfo(5, 5);

        expect(info?.name).toBe("front#0");
    });
});

