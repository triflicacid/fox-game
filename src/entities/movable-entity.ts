import {Entity} from "./entity";
import {AnimatedSpriteSheet} from "../sprites/AnimatedSpriteSheet";
import {SpriteFrame} from "../sprites/sprite";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {KeyBinding} from "../help/key-binding";
import {drawArrow} from "../geometry/arrow";

/**
 * An {@link Entity} that can move: it has a facing direction and a
 * velocity, and moves itself by that velocity each tick. Bind a
 * {@link MovementController} to one to drive it from arrow-key input.
 *
 * @typeParam TSpriteType - Union of sprite type values this entity's sprite sheet's `locateSprite` accepts.
 * @typeParam TStatus - Union of behavioural states this entity can be in.
 */
export abstract class MovableEntity<TSpriteType extends string = string, TStatus extends string = string> extends Entity<TSpriteType, TStatus> {
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
        spriteSheet: AnimatedSpriteSheet<TSpriteType>,
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
     * Whether this entity's animation should keep stepping even while
     * stationary (velocity zero). `false` by default, since a stationary
     * entity normally just shows a single-frame idle pose.
     *
     * @returns `true` if the animation should keep advancing despite no movement.
     */
    protected shouldAnimateWhileStationary(): boolean {
        return false;
    }

    /**
     * Moves this entity straight to `position`, bypassing normal
     * movement/collision.
     *
     * @param position - New position.
     */
    public teleportTo(position: Vector2d): void {
        this.setPosition(position);
    }

    /**
     * Clamps this entity's position into the given world-pixel bounds.
     *
     * @param minX - Minimum X position, in world pixels.
     * @param minY - Minimum Y position, in world pixels.
     * @param maxX - Maximum X position, in world pixels.
     * @param maxY - Maximum Y position, in world pixels.
     */
    public clampPosition(minX: number, minY: number, maxX: number, maxY: number): void {
        const position = this.getPosition();
        const clampedX = Math.min(Math.max(position.x, minX), maxX);
        const clampedY = Math.min(Math.max(position.y, minY), maxY);
        if (clampedX !== position.x || clampedY !== position.y) {
            this.setPosition(new Vector2d(clampedX, clampedY));
        }
    }

    /**
     * Optional handler for a key press that {@link MovementController} didn't
     * already handle itself.
     *
     * @param key - `KeyboardEvent.key` of the pressed key.
     */
    public handleKeyPress?(key: string): void;

    /**
     * Optional hook exposing the key binding(s) {@link handleKeyPress} itself
     * responds to, so the game's help popup can list them.
     *
     * @returns This entity's key bindings.
     */
    public getKeyBindings?(): KeyBinding[];

    /**
     * Draws this entity's bounding box (via the base {@link Entity}
     * implementation), plus an arrow anchored to its centre pointing in
     * {@link facing}'s direction, for debug rendering mode.
     *
     * @param ctx - Canvas context to draw into.
     * @param viewX - Camera's view left edge, in world pixels.
     * @param viewY - Camera's view top edge, in world pixels.
     */
    public override drawDebugOverlay(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        super.drawDebugOverlay(ctx, viewX, viewY);

        const frame = this.getCurrentFrame();
        const center = new Vector2d(
            this.getPosition().x - viewX + frame.w / 2,
            this.getPosition().y - viewY + frame.h / 2,
        );
        const facing = this.getFacingVector();
        const tip = new Vector2d(center.x + facing.x * (frame.w / 2), center.y + facing.y * (frame.h / 2));

        drawArrow(ctx, center, tip, DEBUG_CONFIG.facingArrowColor, DEBUG_CONFIG.facingArrowWidth);
    }

    /**
     * Moves this entity by {@link velocity}, then steps its animation frame
     * as the base {@link Entity.update} does - while moving, or while
     * {@link shouldAnimateWhileStationary} says to keep animating anyway - so
     * a stationary entity's (usually single-frame) idle sprite doesn't get
     * stepped through pointlessly.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public override update(deltaMs: number): void {
        this.setPosition(this.getPosition().add(this.velocity.scale(deltaMs / 1000)));
        if (this.isMoving() || this.shouldAnimateWhileStationary()) {
            super.update(deltaMs);
        }
    }
}
