import {SpriteSheet} from "../sprites/sprite-sheet";
import {SpriteFrame} from "../sprites/sprite";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";

/**
 * Base class for a living/movable thing in the world: something with an
 * attached {@link SpriteSheet}, a position and velocity, a facing direction,
 * and a behavioural status that determines which sprite it's currently
 * showing.
 *
 * @typeParam TArgs - Argument tuple this entity's sprite sheet's `locateSprite` accepts.
 * @typeParam TStatus - Union of behavioural states this entity can be in (e.g. `"walking"`, `"idle"`).
 */
export abstract class Entity<TArgs extends unknown[] = unknown[], TStatus extends string = string> {
    private position: Vector2d;
    private velocity: Vector2d;
    private currentFrame: SpriteFrame;
    private currentBitmap: ImageBitmap | null = null;
    private animationElapsedMs = 0;

    /**
     * @param spriteSheet - Sprite sheet this entity is rendered from.
     * @param status - Initial behavioural status.
     * @param facing - Initial facing direction.
     * @param initialFrame - Initial sprite frame to render, typically obtained from `spriteSheet.locateSprite(...)`.
     * @param frameIntervalMs - How long, in milliseconds, each animation frame is shown before advancing to the next.
     * @param position - Initial position. Defaults to {@link Vector2d.ZERO}.
     * @param velocity - Initial velocity. Defaults to {@link Vector2d.ZERO}.
     */
    protected constructor(
        protected readonly spriteSheet: SpriteSheet<TArgs>,
        protected status: TStatus,
        protected facing: CompassDirection,
        initialFrame: SpriteFrame,
        private readonly frameIntervalMs: number,
        position: Vector2d = Vector2d.ZERO,
        velocity: Vector2d = Vector2d.ZERO,
    ) {
        this.currentFrame = initialFrame;
        this.position = position;
        this.velocity = velocity;
        this.refreshBitmap();
    }

    /**
     * This entity's current behavioural status.
     *
     * @returns The current status.
     */
    public getStatus(): TStatus {
        return this.status;
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
     * This entity's facing direction as a unit vector, e.g. for driving
     * movement in the direction it's facing.
     *
     * @returns Unit vector pointing in {@link facing}'s direction.
     */
    public getFacingVector(): Vector2d {
        return Vector2d.fromDirection(this.facing);
    }

    /**
     * This entity's current position.
     *
     * @returns The current position.
     */
    public getPosition(): Vector2d {
        return this.position;
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
     * The sprite frame this entity is currently rendering.
     *
     * @returns The current frame.
     */
    public getCurrentFrame(): SpriteFrame {
        return this.currentFrame;
    }

    /**
     * The currently loaded bitmap for {@link getCurrentFrame}.
     *
     * @returns The bitmap, or `null` if it's still being extracted from the sprite sheet.
     */
    public getCurrentBitmap(): ImageBitmap | null {
        return this.currentBitmap;
    }

    /**
     * Advances this entity's simulation by one tick: moves it by
     * {@link velocity} and steps its animation frame.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public update(deltaMs: number): void {
        this.position = this.position.add(this.velocity.scale(deltaMs / 1000));
        this.updateAnimation(deltaMs);
    }

    /**
     * Steps this entity's sprite forward by one frame once
     * {@link frameIntervalMs} has elapsed since the last step.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    private updateAnimation(deltaMs: number): void {
        this.animationElapsedMs += deltaMs;
        if (this.animationElapsedMs < this.frameIntervalMs) {
            return;
        }
        this.animationElapsedMs -= this.frameIntervalMs;
        this.currentFrame = this.spriteSheet.next(this.currentFrame);
        this.refreshBitmap();
    }

    /**
     * Extracts and caches the bitmap for {@link currentFrame}, so
     * {@link getCurrentBitmap} doesn't need to re-extract (or await
     * anything) on every draw call.
     */
    private refreshBitmap(): void {
        void this.spriteSheet.extractSprite(this.currentFrame).then((bitmap) => {
            this.currentBitmap = bitmap;
        });
    }
}
