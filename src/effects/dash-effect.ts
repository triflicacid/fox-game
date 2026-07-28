import {Effect} from "./effect";
import {EffectRequest} from "./effect-request";
import {Vector2d} from "../geometry/vector2d";
import {MovableEntity} from "../entities/movable-entity";
import {SpriteFrame} from "../sprites/sprite";
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

/** Dash configuration. */
export interface DashConfiguration {
    /** How long, in milliseconds, an active dash lasts. */
    durationMs: number;
    /** Fill colour used to tint the launch burst and afterimage trail. Change this to retheme the whole effect. */
    trailColor: string;
    /** How many afterimage snapshots the trail keeps at once; the oldest is dropped first. */
    trailSnapshotCount: number;
    /** How long, in milliseconds, a single captured afterimage snapshot stays visible before fully fading. */
    trailSnapshotFadeMs: number;
    /** Peak opacity of the most recently captured afterimage snapshot; older snapshots are dimmer still. */
    trailSnapshotPeakAlpha: number;
    /** How long, in milliseconds, the launch burst grows and fades before disappearing. */
    burstLifetimeMs: number;
    /** Launch burst's starting radius, in world pixels. */
    burstStartRadius: number;
    /** Launch burst's radius once fully grown, in world pixels. */
    burstEndRadius: number;
    /** Upper bound, in milliseconds after the dash's own travel ends, by which every trail visual must have fully faded. */
    trailFadeTailMs: number;
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

/**
 * A single dash's transient visual: a launch burst plus a short trail of
 * cyan afterimages captured from `entity` while it's dashing.
 */
export class DashEffect extends Effect {
    private ageMs = 0;
    private sinceLastSnapshotMs = Infinity;
    private readonly snapshots: DashEffectSnapshot[] = [];
    private scratchCanvas: OffscreenCanvas | undefined;

    /**
     * @param entity - The dashing entity to capture afterimage snapshots from.
     * @param launchPosition - World-pixel point the dash launched from, for the burst.
     * @param config - Tuning parameters for this dash effect.
     */
    public constructor(
        private readonly entity: MovableEntity,
        private readonly launchPosition: Vector2d,
        private readonly config: DashConfiguration,
    ) {
        super();
    }

    /** The lifetime of the dash effect. */
    private lifetimeMs(): number {
        return this.config.durationMs + this.config.trailFadeTailMs;
    }

    /** How often, in milliseconds, a fresh afterimage is captured - spread evenly across the dash's own travel time. */
    private snapshotIntervalMs(): number {
        return this.config.durationMs / (this.config.trailSnapshotCount + 1);
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
        if (this.ageMs < this.config.durationMs) {
            this.maybeCaptureSnapshot();
        }
    }

    /**
     * Whether this effect has fully finished and can be discarded.
     *
     * @returns `true` once every visual has faded out.
     */
    public override isExpired(): boolean {
        return this.ageMs >= this.lifetimeMs();
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
        if (!bitmap || this.sinceLastSnapshotMs < this.snapshotIntervalMs()) {
            return;
        }
        this.sinceLastSnapshotMs = 0;
        this.snapshots.push({
            position: this.entity.getPosition(),
            frame: this.entity.getCurrentFrame(),
            bitmap,
            capturedAtMs: this.ageMs,
        });
        if (this.snapshots.length > this.config.trailSnapshotCount) {
            this.snapshots.shift();
        }
    }

    /** Draws a compact cyan-white flash at the launch point, growing and fading out over burstLifetimeMs`. */
    private drawBurst(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
        if (this.ageMs >= this.config.burstLifetimeMs) {
            return;
        }
        const progress = this.ageMs / this.config.burstLifetimeMs;
        const radius = this.config.burstStartRadius + (this.config.burstEndRadius - this.config.burstStartRadius) * progress;
        const x = this.launchPosition.x - viewX;
        const y = this.launchPosition.y - viewY;

        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.fillStyle = this.config.trailColor;
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
        const fadeProgress = Math.min(1, snapshotAgeMs / this.config.trailSnapshotFadeMs);
        const recencyWeight = (index + 1) / this.snapshots.length;
        const alpha = this.config.trailSnapshotPeakAlpha * (1 - fadeProgress) * recencyWeight;
        if (alpha <= 0) {
            return;
        }

        const {frame, bitmap, position} = snapshot;
        const x = position.x - viewX;
        const y = position.y - viewY;
        const tinted = this.tintSpriteBitmap(bitmap, frame.w, frame.h, this.config.trailColor);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        if (frame.rotation) {
            ctx.rotate(frame.rotation);
        }
        ctx.drawImage(tinted, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
        ctx.restore();
    }

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
    private tintSpriteBitmap(bitmap: ImageBitmap, w: number, h: number, color: string): OffscreenCanvas {
        if (!this.scratchCanvas || this.scratchCanvas.width !== w || this.scratchCanvas.height !== h) {
            this.scratchCanvas = new OffscreenCanvas(w, h);
        }
        const scratchCtx = requireNonNull(this.scratchCanvas.getContext("2d"));
        scratchCtx.clearRect(0, 0, w, h);
        scratchCtx.globalCompositeOperation = "source-over";
        scratchCtx.drawImage(bitmap, 0, 0, w, h);
        scratchCtx.globalCompositeOperation = "source-atop";
        scratchCtx.fillStyle = color;
        scratchCtx.fillRect(0, 0, w, h);
        return this.scratchCanvas;
    }
}
