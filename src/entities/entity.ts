import {AnimatedSpriteSheet} from "../sprites/AnimatedSpriteSheet";
import {SpriteFrame} from "../sprites/sprite";
import {Vector2d} from "../geometry/vector2d";
import {DEBUG_CONFIG} from "../debug/debug-config";

/**
 * Base class for a rendered thing in the world: something with an attached
 * {@link AnimatedSpriteSheet}, a position, and a behavioural status that
 * determines which sprite it's currently showing.
 *
 * @typeParam TSpriteType - Union of sprite type values this entity's sprite sheet's `locateSprite` accepts.
 * @typeParam TStatus - Union of behavioural states this entity can be in (e.g. `"walking"`, `"idle"`).
 */
export abstract class Entity<TSpriteType extends string = string, TStatus extends string = string> {
    private position: Vector2d;
    private currentFrame: SpriteFrame;
    private currentSpriteSheet: AnimatedSpriteSheet<string>;
    private currentBitmap: ImageBitmap | null = null;
    private bitmapRequestId = 0;
    private animationElapsedMs = 0;

    /**
     * @param spriteSheet - Sprite sheet this entity is rendered from.
     * @param status - Initial behavioural status.
     * @param initialFrame - Initial sprite frame to render, typically obtained from `spriteSheet.locateSprite(...)`.
     * @param frameIntervalMs - How long, in milliseconds, each animation frame is shown before advancing to the next.
     * @param position - Initial position. Defaults to {@link Vector2d.ZERO}.
     */
    protected constructor(
        protected readonly spriteSheet: AnimatedSpriteSheet<TSpriteType>,
        protected status: TStatus,
        initialFrame: SpriteFrame,
        private readonly frameIntervalMs: number,
        position: Vector2d = Vector2d.ZERO,
    ) {
        this.currentFrame = initialFrame;
        this.currentSpriteSheet = spriteSheet;
        this.position = position;
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
     * This entity's current position.
     *
     * @returns The current position.
     */
    public getPosition(): Vector2d {
        return this.position;
    }

    /**
     * Sets this entity's position. Intended for subclasses (e.g.
     * {@link MovableEntity}) that need to move themselves.
     *
     * @param position - New position.
     */
    protected setPosition(position: Vector2d): void {
        this.position = position;
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
     * Sets this entity's current sprite frame directly (resetting the
     * animation timer), instead of waiting for {@link updateAnimation} to
     * step to it. Intended for subclasses (e.g. {@link MovableEntity}
     * switching to a new direction's sprite) that need to jump to a
     * specific frame outside the normal animation cycle.
     *
     * @param frame - Frame to switch to.
     */
    protected setCurrentFrame(frame: SpriteFrame): void {
        this.setCurrentFrameFromSheet(frame, this.spriteSheet);
    }

    /**
     * Sets a frame located on an alternate sprite sheet. Subsequent bitmap
     * extraction and animation stepping use that sheet until another frame is
     * selected.
     *
     * @param frame - Frame to switch to.
     * @param spriteSheet - Sheet that owns `frame`'s pixel coordinates.
     */
    protected setCurrentFrameFromSheet(frame: SpriteFrame, spriteSheet: AnimatedSpriteSheet<string>): void {
        this.currentFrame = frame;
        this.currentSpriteSheet = spriteSheet;
        this.animationElapsedMs = 0;
        this.refreshBitmap();
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
     * Advances this entity's simulation by one tick. The base implementation
     * just steps the animation frame; subclasses extend this to add their
     * own behaviour (e.g. {@link MovableEntity} moving by its velocity).
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public update(deltaMs: number): void {
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
        this.currentFrame = this.currentSpriteSheet.next(this.currentFrame);
        this.refreshBitmap();
        this.onFrameAdvanced?.(this.currentFrame);
    }

    /**
     * Optional hook called whenever {@link updateAnimation} steps to a new
     * frame.
     *
     * @param frame - The frame just stepped to.
     */
    protected onFrameAdvanced?(frame: SpriteFrame): void;

    /**
     * Draws this entity's collision bounding box, for debug rendering mode.
     * Uses {@link SpriteFrame.bounds}.
     *
     * @param ctx - Canvas context to draw into.
     * @param viewX - Camera's view left edge, in world pixels.
     * @param viewY - Camera's view top edge, in world pixels.
     */
    public drawDebugOverlay(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        const {bounds} = this.currentFrame;
        const centerX = this.position.x - viewX + this.currentFrame.w / 2;
        const centerY = this.position.y - viewY + this.currentFrame.h / 2;

        ctx.strokeStyle = DEBUG_CONFIG.boundingBoxColor;
        ctx.lineWidth = DEBUG_CONFIG.boundingBoxWidth;
        ctx.beginPath();
        bounds.points.forEach((point, i) => {
            const x = centerX + point.x;
            const y = centerY + point.y;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * Extracts and caches the bitmap for {@link currentFrame}, so
     * {@link getCurrentBitmap} doesn't need to re-extract (or await
     * anything) on every draw call.
     */
    private refreshBitmap(): void {
        const requestId = ++this.bitmapRequestId;
        void this.currentSpriteSheet.extractSprite(this.currentFrame).then((bitmap) => {
            if (requestId === this.bitmapRequestId) {
                this.currentBitmap = bitmap;
            }
        });
    }
}
