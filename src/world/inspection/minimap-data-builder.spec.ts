import {describe, expect, it} from "vitest";
import {MinimapDataBuilder} from "./minimap-data-builder";
import type {WorldGenerationView} from "../generation/world-generation-view";
import type {MovableEntity} from "../../entities/movable-entity";
import {Vector2d} from "../../geometry/vector2d";
import {MINIMAP_CONFIG} from "../../minimap/minimap-config";
import {BIOME_COLORS} from "../generation/biome/biome-colors";

function makeView(overrides: Partial<WorldGenerationView> = {}): WorldGenerationView {
    return {
        setSeed: () => undefined,
        getFieldNames: () => [],
        getSample: () => undefined,
        getField: () => undefined,
        resolveBiomeTagAt: () => "plains",
        getStructures: () => [],
        ...overrides,
    } as WorldGenerationView;
}

function makeEntity(facing = new Vector2d(0, 1)): MovableEntity {
    return {getFacingVector: () => facing} as unknown as MovableEntity;
}

function makeCamera(zoom = 1): {getZoom(): number} {
    return {getZoom: () => zoom};
}

describe("MinimapDataBuilder.build", () => {
    it("uses biome color mode by default", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());

        const data = builder.build(
            new Vector2d(160, 160),
            false,
            makeCamera() as never,
            false,
        );

        expect(data.modeKey).toBe("biome");
        expect(data.sampleColor(0, 0)).toStrictEqual(BIOME_COLORS["plains"]);
    });

    it("uses noise mode when debug is enabled and a field name is given", () => {
        const view = makeView({
            getSample: (fieldName, tileX, tileY) => {
                void fieldName;
                void tileX;
                void tileY;
                return 0.5;
            },
        });
        const builder = new MinimapDataBuilder(16, view, () => makeEntity());

        const data = builder.build(
            new Vector2d(0, 0),
            false,
            makeCamera() as never,
            true,
            "temperature",
        );

        expect(data.modeKey).toBe("noise:temperature");
    });

    it("derives centerTile by dividing center by tileSize", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());

        const data = builder.build(new Vector2d(32, 48), false, makeCamera() as never, false);

        expect(data.centerTile.x).toBeCloseTo(2);
        expect(data.centerTile.y).toBeCloseTo(3);
    });

    it("uses spectator marker when spectating", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());

        const data = builder.build(new Vector2d(0, 0), true, makeCamera() as never, false);

        expect(data.marker.kind).toBe("spectator");
    });

    it("adjusts worldTilesPerPixel by camera zoom", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());

        const data = builder.build(new Vector2d(0, 0), false, makeCamera(2) as never, false);

        expect(data.worldTilesPerPixel).toBeCloseTo(MINIMAP_CONFIG.worldTilesPerPixel / 2);
    });
});

describe("MinimapDataBuilder.buildStats", () => {
    it("counts biome samples and derives tile bounds", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());
        const minimapData = builder.build(new Vector2d(0, 0), false, makeCamera() as never, false);

        const stats = builder.buildStats(minimapData);

        expect(stats.biomeCounts.plains).toBeGreaterThan(0);
        expect(stats.minTileX).toBeLessThan(stats.maxTileX);
        expect(stats.minTileY).toBeLessThan(stats.maxTileY);
    });

    it("reports worldTilesPerPixel matching the minimap data", () => {
        const builder = new MinimapDataBuilder(16, makeView(), () => makeEntity());
        const minimapData = builder.build(new Vector2d(0, 0), false, makeCamera(2) as never, false);

        const stats = builder.buildStats(minimapData);

        expect(stats.worldTilesPerPixel).toBeCloseTo(minimapData.worldTilesPerPixel);
    });
});

