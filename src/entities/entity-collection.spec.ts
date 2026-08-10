import {describe, expect, it} from "vitest";
import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {createRecordingContext, createTestMovableEntity} from "../world/testing/world-test-helpers";
import {EntityCollection} from "./entity-collection";

describe("EntityCollection main entity", () => {
    it("throws when no main entity has been set", () => {
        const collection = new EntityCollection();
        expect(() => collection.getMainEntity()).toThrow();
    });

    it("adds the main entity to the entity list and returns it", () => {
        const collection = new EntityCollection();
        const entity = createTestMovableEntity();

        collection.setMainEntity(entity);

        expect(collection.getMainEntity()).toBe(entity);
        expect(collection.getEntities()).toEqual([entity]);
    });

    it("destroys the previous main entity's dispatcher when replaced", () => {
        const collection = new EntityCollection();
        const dispatcherEvents: string[] = [];
        const previous = Object.assign(createTestMovableEntity(), {
            effectDispatcher: {clear: () => dispatcherEvents.push("cleared")},
        });
        collection.setMainEntity(previous);

        const next = createTestMovableEntity();
        collection.setMainEntity(next);

        expect(dispatcherEvents).toEqual(["cleared"]);
        expect(collection.getMainEntity()).toBe(next);
        expect(collection.getEntities()).toEqual([next]);
    });

    it("teleports the main entity bypassing collision", () => {
        const collection = new EntityCollection();
        const events: string[] = [];
        collection.setMainEntity(createTestMovableEntity({events}));

        collection.teleportMainEntityTo(new Vector2d(40, 20));

        expect(collection.getMainEntity().getPosition()).toEqual(new Vector2d(40, 20));
        expect(events).toEqual(["entity:teleport:40,20"]);
    });
});

describe("EntityCollection update", () => {
    it("updates every entity and returns each movable entity's pre-update position", () => {
        const collection = new EntityCollection();
        const events: string[] = [];
        const entity = createTestMovableEntity({position: new Vector2d(8, 8), nextPosition: new Vector2d(24, 8), events});
        collection.setMainEntity(entity);

        const previousPositions = collection.update(16);

        expect(events).toEqual(["entity:update"]);
        expect(previousPositions.get(entity)).toEqual(new Vector2d(8, 8));
        expect(entity.getPosition()).toEqual(new Vector2d(24, 8));
    });
});

describe("EntityCollection draw", () => {
    it("skips entities without a current bitmap or outside the camera view", () => {
        const collection = new EntityCollection();
        const events: string[] = [];
        collection.setMainEntity(createTestMovableEntity({position: new Vector2d(8, 8), bitmap: null, events}));

        collection.draw(createRecordingContext(events), new Camera(new Vector2d(8, 8), 16, 16));

        expect(events).not.toContain("entity:draw");
    });

    it("draws a visible entity and its debug overlay when hitboxes are enabled", () => {
        const collection = new EntityCollection();
        const events: string[] = [];
        collection.setMainEntity(createTestMovableEntity({position: new Vector2d(8, 8), bitmap: {} as ImageBitmap, events}));

        collection.draw(createRecordingContext(events), new Camera(new Vector2d(8, 8), 16, 16), true);

        expect(events).toEqual(["entity:draw", "entity:debug"]);
    });
});

describe("EntityCollection clear", () => {
    it("removes every entity and clears its dispatcher", () => {
        const collection = new EntityCollection();
        const dispatcherEvents: string[] = [];
        const entity = Object.assign(createTestMovableEntity(), {
            effectDispatcher: {clear: () => dispatcherEvents.push("cleared")},
        });
        collection.setMainEntity(entity);

        collection.clear();

        expect(dispatcherEvents).toEqual(["cleared"]);
        expect(collection.getEntities()).toEqual([]);
        expect(() => collection.getMainEntity()).toThrow();
    });
});
