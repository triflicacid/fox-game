import {Camera} from "../camera/camera";
import {Vector2d} from "../geometry/vector2d";
import {requireNonNull} from "../util";
import {Entity} from "./entity";
import {MovableEntity} from "./movable-entity";

/** Read-only view over the world's live entity set. */
export interface ReadonlyEntityCollection {
    /** Every entity currently in the world. */
    getEntities(): readonly Entity[];

    /** The entity currently under player control. Throws if none has been set. */
    getMainEntity(): MovableEntity;
}

/** Owns the world's live entities, the main-entity invariant, and their per-tick update/draw. */
export class EntityCollection implements ReadonlyEntityCollection {
    private readonly entities: Entity[] = [];

    /**
     * The entity currently under player control - `undefined` until
     * {@link setMainEntity} is called at least once.
     */
    private mainEntity: MovableEntity | undefined;

    public getEntities(): readonly Entity[] {
        return this.entities;
    }

    public getMainEntity(): MovableEntity {
        return this.requireMainEntity();
    }

    /**
     * Switches which entity is under player control, destroying and
     * cleaning up whichever entity previously held that role.
     */
    public setMainEntity(entity: MovableEntity): this {
        if (this.mainEntity) {
            this.destroyEntity(this.mainEntity);
        }
        this.mainEntity = entity;
        this.entities.push(entity);
        return this;
    }

    /**
     * Teleports the main entity so its sprite centre lands on `target`,
     * bypassing collision. Works on any world position regardless of chunk state.
     */
    public teleportMainEntityTo(target: Vector2d): void {
        this.requireMainEntity().teleportTo(target);
    }

    /**
     * Advances every entity by one tick.
     *
     * @param deltaMs - Elapsed time since the last tick, in milliseconds.
     * @returns Each movable entity's position immediately before this update.
     */
    public update(deltaMs: number): ReadonlyMap<MovableEntity, Vector2d> {
        const previousPositions = new Map<MovableEntity, Vector2d>();
        for (const entity of this.entities) {
            if (entity instanceof MovableEntity) {
                previousPositions.set(entity, entity.getPosition());
            }
            entity.update(deltaMs);
        }
        return previousPositions;
    }

    /**
     * Draws every entity whose sprite overlaps the camera's view. Entities
     * entirely outside the view are skipped.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render entities through.
     * @param hitboxesEnabled - Whether to draw each entity's bounding box/facing arrow.
     */
    public draw(ctx: CanvasRenderingContext2D, camera: Camera, hitboxesEnabled = false): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();

        for (const entity of this.entities) {
            const bitmap = entity.getCurrentBitmap();
            if (!bitmap) {
                continue;
            }

            const rect = entity.getBoundingRect();
            if (!camera.isRectVisible(rect)) {
                continue;
            }

            const frame = entity.getCurrentFrame();
            if (frame.rotation) {
                const position = entity.getPosition();
                ctx.save();
                ctx.translate(position.x - viewX, position.y - viewY);
                ctx.rotate(frame.rotation);
                ctx.drawImage(bitmap, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
                if (hitboxesEnabled) {
                    entity.drawDebugOverlay(ctx, viewX, viewY);
                }
                ctx.restore();
            } else {
                ctx.drawImage(bitmap, rect.x - viewX, rect.y - viewY, rect.w, rect.h);
                if (hitboxesEnabled) {
                    entity.drawDebugOverlay(ctx, viewX, viewY);
                }
            }
        }
    }

    /** Removes every entity and clears its effect dispatcher, e.g. during world disposal. */
    public clear(): void {
        for (const entity of this.entities) {
            entity.effectDispatcher.clear();
        }
        this.entities.length = 0;
        this.mainEntity = undefined;
    }

    /** Removes `entity` and clears its effect dispatcher. */
    private destroyEntity(entity: MovableEntity): void {
        entity.effectDispatcher.clear();
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
    }

    /** Returns the main entity, throwing if none has been set. */
    private requireMainEntity(): MovableEntity {
        return requireNonNull(this.mainEntity);
    }
}
