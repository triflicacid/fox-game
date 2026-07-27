import {Effect} from "./effect";
import {EffectRequest} from "./effect-request";
import {Vector2d} from "../geometry/vector2d";
import {MovableEntity} from "../entities/movable-entity";
import {SpriteFrame} from "../sprites/sprite";
import {MOVEMENT_CONSTANTS} from "../entities/movement-constants";
import {requireNonNull} from "../util";

/** Broadcast by a dashing entity (see `MovableEntity.requestEffect`) to ask for the cyan dash trail. */
export class DashEffectRequest extends EffectRequest {
    /**
     * @param position - World-pixel point the dash launched from (the entity's centre at that moment).
     * @param direction - Normalized world-space direction the dash travels in.
     */
    public constructor(
        public readonly position: Vector2d,
        public readonly direction: Vector2d,
    ) {
        super("dash");
    }
}

/** One captured render state of the dashing entity, drawn as a translucent afterimage. */
interface DashEffectSnapshot {
    /** World-pixel position (entity centre) at capture time. */
    position: Vector2d;
    /** Sprite frame shown at capture time (for its size/rotation). */
    frame: SpriteFrame;
    /** Bitmap shown at capture time. */
    bitmap: ImageBitmap;
    /** This effect's {@link DashEffect.ageMs} when the snapshot was captured. */
    capturedAtMs: number;
}

/** How often, in milliseconds, a fresh afterimage is captured - spread evenly across the dash's own travel time. */
function snapshotIntervalMs(): number {
    return MOVEMENT_CONSTANTS.dash.durationMs / (MOVEMENT_CONSTANTS.dash.trailSnapshotCount + 1);
}

/**
 * Reused across every snapshot tint (see {@link tintSpriteBitmap}).
 */
let scratchCanvas: OffscreenCanvas | undefined;

/**
 * Renders `bitmap` into an offscreen buffer and recolors every opaque pixel
 * to a flat `color`, preserving the bitmap's own alpha shape.
 *
 * @param bitmap - Sprite bitmap to tint.
 * @param w - Bitmap's drawn width, in pixels.
 * @param h - Bitmap's drawn height, in pixels.
 * @param color - Flat fill colour for the silhouette.
 * @returns An offscreen canvas containing just the tinted silhouette.
 */
function tintSpriteBitmap(bitmap: ImageBitmap, w: number, h: number, color: string): OffscreenCanvas {
    if (!scratchCanvas || scratchCanvas.width !== w || scratchCanvas.height !== h) {
        scratchCanvas = new OffscreenCanvas(w, h);
    }
    const scratchCtx = requireNonNull(scratchCanvas.getContext("2d"));
    scratchCtx.clearRect(0, 0, w, h);
    scratchCtx.globalCompositeOperation = "source-over";
    scratchCtx.drawImage(bitmap, 0, 0, w, h);
    scratchCtx.globalCompositeOperation = "source-atop";
    scratchCtx.fillStyle = color;
    scratchCtx.fillRect(0, 0, w, h);
    return scratchCanvas;
}

/**
 * A single dash's transient visual: a launch burst plus a short trail of
 * cyan afterimages captured from `entity` while it's dashing.
 */
export class DashEffect extends Effect {
    /**
     * Recomputed on every call rather than cached, since `MOVEMENT_CONSTANTS`
     * is live-editable through the field registry.
     */
    private static lifetimeMs(): number {
        return MOVEMENT_CONSTANTS.dash.durationMs + MOVEMENT_CONSTANTS.dash.trailFadeTailMs;
    }

    private ageMs = 0;
    private sinceLastSnapshotMs = Infinity;
    private readonly snapshots: DashEffectSnapshot[] = [];

    /**
     * @param entity - The dashing entity to capture afterimage snapshots from.
     * @param launchPosition - World-pixel point the dash launched from, for the burst.
     */
    public constructor(
        private readonly entity: MovableEntity,
        private readonly launchPosition: Vector2d,
    ) {
        super();
    }

    /**
     * Ages this effect by `deltaMs`, capturing a fresh afterimage from
     * {@link entity} while still within the dash's own travel time.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public override update(deltaMs: number): void {
        this.ageMs += deltaMs;
        this.sinceLastSnapshotMs += deltaMs;
        if (this.ageMs < MOVEMENT_CONSTANTS.dash.durationMs) {
            this.maybeCaptureSnapshot();
        }
    }

    /**
     * Whether this effect has fully finished and can be discarded.
     *
     * @returns `true` once every visual has faded out.
     */
    public override isExpired(): boolean {
        return this.ageMs >= DashEffect.lifetimeMs();
    }

    /**
     * Draws the launch burst and every currently visible afterimage.
     *
     * @param ctx - Canvas context to draw into.
     * @param viewX - Camera's view left edge, in world pixels.
     * @param viewY - Camera's view top edge, in world pixels.
     */
    public override draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        this.drawBurst(ctx, viewX, viewY);
        this.snapshots.forEach((snapshot, index) => this.drawSnapshot(ctx, viewX, viewY, snapshot, index));
    }

    /**
     * Records a fresh afterimage if enough time has passed since the last
     * one, dropping the oldest snapshot once `MOVEMENT_CONSTANTS.dash.trailSnapshotCount`
     * is exceeded. A no-op while {@link entity}'s bitmap isn't loaded yet.
     */
    private maybeCaptureSnapshot(): void {
        const bitmap = this.entity.getCurrentBitmap();
        if (!bitmap || this.sinceLastSnapshotMs < snapshotIntervalMs()) {
            return;
        }
        this.sinceLastSnapshotMs = 0;
        this.snapshots.push({
            position: this.entity.getPosition(),
            frame: this.entity.getCurrentFrame(),
            bitmap,
            capturedAtMs: this.ageMs,
        });
        if (this.snapshots.length > MOVEMENT_CONSTANTS.dash.trailSnapshotCount) {
            this.snapshots.shift();
        }
    }

    /** Draws a compact cyan-white flash at the launch point, growing and fading out over `MOVEMENT_CONSTANTS.dash.burstLifetimeMs`. */
    private drawBurst(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        if (this.ageMs >= MOVEMENT_CONSTANTS.dash.burstLifetimeMs) {
            return;
        }
        const progress = this.ageMs / MOVEMENT_CONSTANTS.dash.burstLifetimeMs;
        const radius = MOVEMENT_CONSTANTS.dash.burstStartRadius + (MOVEMENT_CONSTANTS.dash.burstEndRadius - MOVEMENT_CONSTANTS.dash.burstStartRadius) * progress;
        const x = this.launchPosition.x - viewX;
        const y = this.launchPosition.y - viewY;

        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.fillStyle = MOVEMENT_CONSTANTS.dash.trailColor;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** Draws one afterimage: the entity's captured bitmap tinted a flat trail colour, faded by age and recency. */
    private drawSnapshot(ctx: CanvasRenderingContext2D, viewX: number, viewY: number, snapshot: DashEffectSnapshot, index: number): void {
        const snapshotAgeMs = this.ageMs - snapshot.capturedAtMs;
        const fadeProgress = Math.min(1, snapshotAgeMs / MOVEMENT_CONSTANTS.dash.trailSnapshotFadeMs);
        const recencyWeight = (index + 1) / this.snapshots.length;
        const alpha = MOVEMENT_CONSTANTS.dash.trailSnapshotPeakAlpha * (1 - fadeProgress) * recencyWeight;
        if (alpha <= 0) {
            return;
        }

        const {frame, bitmap, position} = snapshot;
        const x = position.x - viewX;
        const y = position.y - viewY;
        const tinted = tintSpriteBitmap(bitmap, frame.w, frame.h, MOVEMENT_CONSTANTS.dash.trailColor);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        if (frame.rotation) {
            ctx.rotate(frame.rotation);
        }
        ctx.drawImage(tinted, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
        ctx.restore();
    }
}
