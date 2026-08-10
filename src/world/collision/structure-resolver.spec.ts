import {describe, expect, it} from "vitest";
import {rectPolygon} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import type {SpriteTile} from "../../sprites/sprite";
import type {Structure, StructurePieceInstance} from "../generation/structure/structure";
import type {StructureSheetRegistry} from "../rendering/structure-sheet-dispatch";
import {StructureResolver} from "./structure-resolver";

/** Builds a fake registry whose single sheet resolves every sprite to `tile`. */
function registryFor(tile: SpriteTile, bitmap: ImageBitmap = {} as ImageBitmap): StructureSheetRegistry {
    return {
        findSheet: () => ({
            getTileBitmap: async () => bitmap,
            locateTile: () => tile,
        }),
    };
}

describe("StructureResolver sprite lookups", () => {
    it("resolves a sprite's bitmap through the registry", async () => {
        const bitmap = {} as ImageBitmap;
        const resolver = new StructureResolver(registryFor({x: 0, y: 0, w: 16, h: 16}, bitmap), () => []);

        await expect(resolver.getSpriteBitmap("oak-trunk")).resolves.toBe(bitmap);
    });

    it("locates a sprite through the registry", () => {
        const tile: SpriteTile = {x: 0, y: 0, w: 16, h: 16};
        const resolver = new StructureResolver(registryFor(tile), () => []);

        expect(resolver.locateSprite("oak-trunk")).toBe(tile);
    });
});

describe("StructureResolver collision hulls", () => {
    it("returns undefined for a sprite with no authored bounds", () => {
        const resolver = new StructureResolver(registryFor({x: 0, y: 0, w: 16, h: 16}), () => []);

        expect(resolver.collisionPolygonForSprite("oak-trunk", 100, 100, 16)).toBeUndefined();
    });

    it("scales and centres a sprite's authored hull at the requested tile size", () => {
        const tile: SpriteTile = {
            x: 0, y: 0, w: 8, h: 8,
            bounds: {points: [{x: -4, y: -4}, {x: 4, y: -4}, {x: 4, y: 4}, {x: -4, y: 4}]},
        };
        const resolver = new StructureResolver(registryFor(tile), () => []);

        const polygon = resolver.collisionPolygonForSprite("oak-trunk", 100, 100, 16);

        expect(polygon).toEqual([
            new Vector2d(92, 92), new Vector2d(108, 92), new Vector2d(108, 108), new Vector2d(92, 108),
        ]);
    });

    it("falls back to the full tile square when the piece's sprite has no authored hull", () => {
        const resolver = new StructureResolver(registryFor({x: 0, y: 0, w: 16, h: 16}), () => []);
        const piece = {sprites: ["oak-trunk"]} as unknown as StructurePieceInstance;

        expect(resolver.structurePiecePolygon(piece, 2, 3, 16)).toEqual(rectPolygon(32, 48, 16, 16));
    });

    it("uses the piece's first sprite's authored hull, centred on its tile", () => {
        const tile: SpriteTile = {
            x: 0, y: 0, w: 16, h: 16,
            bounds: {points: [{x: -8, y: -8}, {x: 8, y: -8}, {x: 8, y: 8}, {x: -8, y: 8}]},
        };
        const resolver = new StructureResolver(registryFor(tile), () => []);
        const piece = {sprites: ["oak-trunk"]} as unknown as StructurePieceInstance;

        expect(resolver.structurePiecePolygon(piece, 2, 3, 16)).toEqual(rectPolygon(32, 48, 16, 16));
    });
});

describe("StructureResolver structure lookups", () => {
    it("finds the structure whose id matches", () => {
        const tree = {getStructureId: () => "tree"} as unknown as Structure;
        const cactus = {getStructureId: () => "cactus"} as unknown as Structure;
        const resolver = new StructureResolver(registryFor({x: 0, y: 0, w: 16, h: 16}), () => [tree, cactus]);

        expect(resolver.findStructure("cactus")).toBe(cactus);
    });

    it("returns undefined when no structure matches", () => {
        const resolver = new StructureResolver(registryFor({x: 0, y: 0, w: 16, h: 16}), () => []);

        expect(resolver.findStructure("cactus")).toBeUndefined();
    });
});
