import {describe, expect, it} from "vitest";
import {Camera} from "../camera/camera";
import {Effect} from "../effects/effect";
import {ConstantField} from "./generation/noise-field";
import {Vector2d} from "../geometry/vector2d";
import {Minimap} from "../minimap/minimap";
import {MINIMAP_CONFIG} from "../minimap/minimap-config";
import type {Tile} from "./tiles/tile";
import {World} from "./world";
import {createTestWorldDependencies, TestTerrainGenerationSource} from "./testing/create-test-world-dependencies";
import {createRecordingContext, createTestChunk, createTestMovableEntity} from "./testing/world-test-helpers";

/** Effect double that records its lifecycle calls. */
class RecordingEffect extends Effect {
    public constructor(private readonly events: string[]) {
        super();
    }

    /** Records an update. */
    public override update(): void {
        this.events.push("effect:update");
    }

    /** Keeps the effect active. */
    public override isExpired(): boolean {
        return false;
    }

    /** Records a draw. */
    public override draw(): void {
        this.events.push("effect:draw");
    }
}

/** Returns the first event index and fails clearly when it is absent. */
function eventIndex(events: readonly string[], event: string): number {
    const index = events.indexOf(event);
    expect(index, `missing event ${event}`).toBeGreaterThanOrEqual(0);
    return index;
}

describe("World render ordering", () => {
    it("draws effects and entities between chunk background and foreground passes", () => {
        const events: string[] = [];
        const dependencies = createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY, {events}),
            minimap: {draw: () => events.push("minimap:draw")},
        });
        const world = new World(16, dependencies);
        world.setMainEntity(createTestMovableEntity({bitmap: {} as ImageBitmap}));
        world.registerEffect(new RecordingEffect(events));
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.draw(createRecordingContext(events, 512, 256), camera);

        const lastChunk = events.lastIndexOf("chunk:draw");
        const firstProps = eventIndex(events, "chunk:props");
        expect(lastChunk).toBeLessThan(eventIndex(events, "effect:draw"));
        expect(eventIndex(events, "effect:draw")).toBeLessThan(eventIndex(events, "entity:draw"));
        expect(eventIndex(events, "entity:draw")).toBeLessThan(firstProps);
        expect(events.lastIndexOf("chunk:props")).toBeLessThan(eventIndex(events, "context:restore"));
        expect(eventIndex(events, "context:restore")).toBeLessThan(eventIndex(events, "minimap:draw"));
    });

    it("clears minimap hover state on the first draw after disabling it", () => {
        const dependencies = createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY),
        });
        const world = new World(16, dependencies);
        world.setMainEntity(createTestMovableEntity());
        const camera = new Camera(new Vector2d(128, 128), 256, 256);
        const context = createRecordingContext([], 512, 256);
        const hoverX = Minimap.getBoxLeft(512) + 1;
        const hoverY = MINIMAP_CONFIG.margin + 1;

        world.draw(context, camera);
        expect(world.getMinimapHoverInfo(hoverX, hoverY, 512)).toBeDefined();

        world.setMinimapEnabled(false);
        world.draw(context, camera);
        expect(world.getMinimapHoverInfo(hoverX, hoverY, 512)).toBeUndefined();
    });

    it("draws the minimap before the debug HUD and minimap statistics", () => {
        const events: string[] = [];
        const tile = {
            biomeTag: "plains",
            featureTag: "none",
            groundType: "test ground",
            getCollision: () => undefined,
        } as unknown as Tile;
        const dependencies = createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => Object.assign(createTestChunk(chunkX, chunkY, {ready: true}), {
                getTile: () => tile,
                getStructurePieceAt: () => undefined,
            }),
            minimap: {draw: () => events.push("minimap:draw")},
            debugHud: {draw: () => events.push("debug-hud:draw")},
            minimapStatsHud: {draw: () => events.push("minimap-stats:draw")},
        });
        const world = new World(16, dependencies);
        world.setMainEntity(createTestMovableEntity());

        world.draw(
            createRecordingContext(events, 512, 256),
            new Camera(new Vector2d(128, 128), 256, 256),
            true,
        );

        expect(eventIndex(events, "context:restore")).toBeLessThan(eventIndex(events, "minimap:draw"));
        expect(eventIndex(events, "minimap:draw")).toBeLessThan(eventIndex(events, "debug-hud:draw"));
        expect(eventIndex(events, "debug-hud:draw")).toBeLessThan(eventIndex(events, "minimap-stats:draw"));
    });

    it("draws the noise overlay before effects when debugging with a selected field", () => {
        const events: string[] = [];
        const generator = new TestTerrainGenerationSource(1);
        generator.fields.register(new ConstantField("temperature", 0.5));
        const dependencies = createTestWorldDependencies(1, {
            chunkGenerator: generator,
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY, {events}),
        });
        const world = new World(16, dependencies);
        world.setMainEntity(createTestMovableEntity({bitmap: {} as ImageBitmap}));
        world.registerEffect(new RecordingEffect(events));
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.draw(createRecordingContext(events, 512, 256), camera, true, false, false, false, undefined, 0, undefined, "temperature");

        expect(eventIndex(events, "chunk:noise")).toBeLessThan(eventIndex(events, "effect:draw"));
    });

    it("draws chunk debug overlays and biome outlines after props but before the context restores", () => {
        const events: string[] = [];
        const dependencies = createTestWorldDependencies(1, {
            chunkFactory: (chunkX, chunkY) => createTestChunk(chunkX, chunkY, {events, ready: true}),
        });
        const world = new World(16, dependencies);
        world.setMainEntity(createTestMovableEntity({bitmap: {} as ImageBitmap}));
        const camera = new Camera(new Vector2d(128, 128), 256, 256);

        world.draw(createRecordingContext(events, 512, 256), camera, false, true);

        const lastProps = events.lastIndexOf("chunk:props");
        expect(lastProps).toBeLessThan(eventIndex(events, "chunk:debug"));
        expect(events.lastIndexOf("chunk:debug")).toBeLessThan(eventIndex(events, "context:restore"));
    });
});



