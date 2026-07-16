import {Entity} from "./entity";
import {SpriteSheet} from "../sprites/sprite-sheet";
import {SpriteFrame} from "../sprites/sprite";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";

/**
 * An {@link Entity} that can move: it has a facing direction and a
 * velocity, and moves itself by that velocity each tick. Bind a
 * {@link MovementController} to one to drive it from arrow-key input.
 *
 * @typeParam TArgs - Argument tuple this entity's sprite sheet's `locateSprite` accepts.
 * @typeParam TStatus - Union of behavioural states this entity can be in.
 */
export abstract class MovableEntity<TArgs extends unknown[] = unknown[], TStatus extends string = string> extends Entity<TArgs, TStatus> {
    private velocity: Vector2d;

    /**
     * @param spriteSheet - Sprite sheet this entity is rendered from.
     * @param status - Initial behavioural status.
     * @param facing - Initial facing direction.
     * @param initialFrame - Initial sprite frame to render.
     * @param frameIntervalMs - How long, in milliseconds, each animation frame is shown before advancing to the next.
     * @param position - Initial position. Defaults to {@link Vector2d.ZERO}.
     * @param velocity - Initial velocity. Defaults to {@link Vector2d.ZERO}.
     */
    protected constructor(
        spriteSheet: SpriteSheet<TArgs>,
        status: TStatus,
        protected facing: CompassDirection,
        initialFrame: SpriteFrame,
        frameIntervalMs: number,
        position: Vector2d = Vector2d.ZERO,
        velocity: Vector2d = Vector2d.ZERO,
    ) {
        super(spriteSheet, status, initialFrame, frameIntervalMs, position);
        this.velocity = velocity;
    }

    /**
     * This entity's current facing direction.
     *
     * @returns The current facing.
     */
    public getFacing(): CompassDirection {
        return this.facing;
    }

    /**
     * Sets this entity's facing direction, e.g. from a bound
     * {@link MovementController}. If this actually changes the facing, the
     * entity's sprite is switched to that direction's, starting from its
     * first animation phase.
     *
     * @param facing - New facing direction.
     */
    public setFacing(facing: CompassDirection): void {
        if (facing === this.facing) {
            return;
        }
        this.facing = facing;
        this.setCurrentFrame(this.locateFrameForFacing(facing, this.isMoving()));
    }

    /**
     * This entity's facing direction as a unit vector.
     *
     * @returns Unit vector pointing in {@link facing}'s direction.
     */
    public getFacingVector(): Vector2d {
        return Vector2d.fromDirection(this.facing);
    }

    /**
     * This entity's current velocity.
     *
     * @returns The current velocity.
     */
    public getVelocity(): Vector2d {
        return this.velocity;
    }

    /**
     * Sets this entity's velocity, e.g. from a bound {@link MovementController}.
     *
     * @param velocity - New velocity, in world pixels per second.
     */
    public setVelocity(velocity: Vector2d): void {
        const wasMoving = this.isMoving();
        this.velocity = velocity;
        const isMovingNow = this.isMoving();
        if (isMovingNow !== wasMoving) {
            this.setCurrentFrame(this.locateFrameForFacing(this.facing, isMovingNow));
        }
    }

    /**
     * Whether this entity currently has any velocity.
     *
     * @returns `true` if {@link getVelocity} is non-zero.
     */
    public isMoving(): boolean {
        return this.velocity.x !== 0 || this.velocity.y !== 0;
    }

    /**
     * Locates the sprite frame this entity should show for the given facing
     * and moving state, at its first animation phase. Used by
     * {@link setFacing}/{@link setVelocity} to keep the sprite in sync
     * whenever either changes.
     *
     * @param direction - Direction to locate a frame for.
     * @param moving - Whether the entity is currently moving (as opposed to standing still facing that direction).
     * @returns The located frame.
     */
    protected abstract locateFrameForFacing(direction: CompassDirection, moving: boolean): SpriteFrame;

    /**
     * Moves this entity by {@link velocity}, then steps its animation frame
     * as the base {@link Entity.update} does - only while moving, so a
     * stationary entity's (single-frame) idle sprite doesn't get stepped
     * through pointlessly.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public override update(deltaMs: number): void {
        this.setPosition(this.getPosition().add(this.velocity.scale(deltaMs / 1000)));
        if (this.isMoving()) {
            super.update(deltaMs);
        }
    }
}
