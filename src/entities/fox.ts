import {MovableEntity} from "./movable-entity";
import {AnthroFoxSpriteSheet, FoxSpriteSheet, FoxSpriteType} from "../sprites/fox";
import {CompassDirection} from "../geometry/direction";
import {SpriteFrame} from "../sprites/sprite";
import {Vector2d} from "../geometry/vector2d";
import {KeyBinding} from "../help/key-binding";

/** Behavioural states a {@link Fox} entity can be in. */
export type FoxStatus = "idle" | "walking" | "curling" | "sleeping" | "sleepTurning" | "uncurling";

/** Default milliseconds per frame for rows that don't define their own timing. */
const DEFAULT_FRAME_INTERVAL_MS = 120;

/** Direction a fox faces when spawned. */
const INITIAL_FACING: CompassDirection = "N";

/**
 * Direction the `curl`/`uncurl` art is drawn at.
 */
const CURL_ART_FACING: CompassDirection = "NW";
const CURL_ART_ANGLE = Vector2d.fromDirection(CURL_ART_FACING).angleRadians();

/** The fox entity: a {@link MovableEntity} that can be driven around by a {@link MovementController}. */
export class Fox extends MovableEntity<FoxSpriteType, FoxStatus> {
    /**
     * Same sheet instance as the base class's `spriteSheet` field, kept here
     * too so {@link locateFrameForFacing} can reach `FoxSpriteSheet`-specific
     * methods (like {@link FoxSpriteSheet.locateIdleSprite}) that aren't part
     * of the generic `AnimatedSpriteSheet` type that field is declared with.
     */
    private readonly foxSpriteSheet: FoxSpriteSheet;
    private readonly anthroFoxSpriteSheet: AnthroFoxSpriteSheet;
    private anthroStandingEnabled = false;

    /**
     * Facing/velocity requested by a movement key press while asleep (or
     * mid-curl/mid-uncurl), held until the `uncurl` animation finishes so it
     * can be applied then instead of immediately.
     */
    private pendingWakeFacing: CompassDirection | null = null;
    private pendingWakeVelocity: Vector2d | null = null;

    /** Phases left to step through before a triggered `sleepTurn` returns to a static `sleeping` hold. */
    private sleepTurnPhasesRemaining = 0;

    public constructor() {
        const spriteSheet = new FoxSpriteSheet();
        super(spriteSheet, "idle", INITIAL_FACING, spriteSheet.locateIdleSprite(INITIAL_FACING), DEFAULT_FRAME_INTERVAL_MS);
        this.foxSpriteSheet = spriteSheet;
        this.anthroFoxSpriteSheet = new AnthroFoxSpriteSheet();
    }

    /**
     * Toggles the debug anthropomorphic sprites. When enabled, directional
     * idle and walking frames are taken from {@link anthroFoxSpriteSheet};
     * resting actions (curl/uncurl/sleep) always use {@link foxSpriteSheet}.
     */
    public toggleAnthroStanding(): void {
        this.anthroStandingEnabled = !this.anthroStandingEnabled;
        if (!this.isRestState()) {
            this.setFrameForFacing(this.facing, this.isMoving());
        }
    }

    /**
     * `Z` manually puts the fox to sleep, or - if it's already asleep -
     * triggers a one-off `sleepTurn`. No-op while `curling`, `uncurling`, or
     * already mid-`sleepTurn`.
     *
     * @param key - `KeyboardEvent.key` of the pressed key.
     */
    public override handleKeyPress(key: string): void {
        if (key !== "z" && key !== "Z") {
            return;
        }
        if (this.status === "sleeping") {
            this.beginSleepTurn();
            return;
        }
        if (this.isRestState()) {
            return;
        }
        this.setVelocity(Vector2d.ZERO);
        this.status = "curling";
        this.setCurrentFrame({...this.foxSpriteSheet.locateSprite("curl"), rotation: this.rotationFor(this.facing)});
    }

    /**
     * `Z`'s key binding, for the help popup.
     *
     * @returns This entity's key bindings.
     */
    public override getKeyBindings(): KeyBinding[] {
        return [
            {key: "Z", description: "Sleep, or turn over while sleeping"},
        ];
    }

    /**
     * While asleep (or resting), movement input
     * doesn't move the fox yet, but cached it.
     *
     * @param direction - Requested facing direction.
     */
    public override setFacing(direction: CompassDirection): void {
        if (this.isRestState()) {
            this.pendingWakeFacing = direction;
            return;
        }
        super.setFacing(direction);
    }

    /**
     * While asleep (or resting), movement input
     * doesn't move the fox directly.
     * A non-zero velocity request wakes it
     * up, while additional requests caches it.
     *
     * @param velocity - Requested velocity.
     */
    public override setVelocity(velocity: Vector2d): void {
        if (this.isRestState()) {
            if (this.status === "uncurling") {
                this.pendingWakeVelocity = velocity;
            } else if (velocity.x !== 0 || velocity.y !== 0) {
                this.beginWaking(velocity);
            }
            return;
        }
        super.setVelocity(velocity);
    }

    /**
     * `curling`/`uncurling`/`sleepTurning` all need continued frame-stepping
     * while stationary; `sleeping` itself is a static held pose.
     */
    protected override shouldAnimateWhileStationary(): boolean {
        return this.status === "curling" || this.status === "uncurling" || this.status === "sleepTurning";
    }

    protected override locateFrameForFacing(direction: CompassDirection, moving: boolean): SpriteFrame {
        if (this.shouldUseAnthroSprites()) {
            return moving ? this.anthroFoxSpriteSheet.locateSprite(direction) : this.anthroFoxSpriteSheet.locateIdleSprite(direction);
        }
        return moving ? this.foxSpriteSheet.locateSprite(direction) : this.foxSpriteSheet.locateIdleSprite(direction);
    }

    /** Selects the correct sheet for each directional pose based on the anthro toggle and rest state. */
    protected override locateSpriteSheetForFacing(direction: CompassDirection, moving: boolean): FoxSpriteSheet | AnthroFoxSpriteSheet {
        void direction;
        void moving;
        return this.shouldUseAnthroSprites() ? this.anthroFoxSpriteSheet : this.foxSpriteSheet;
    }

    /** Whether directional frames should come from the anthro sheet rather than the normal fox sheet. */
    private shouldUseAnthroSprites(): boolean {
        return this.anthroStandingEnabled && !this.isRestState();
    }

    /**
     * Advances the sleep state machine once an animation reaches its last
     * frame: `curling` → `sleeping` (just holding the already-reached last
     * frame) once `curl` finishes, and `uncurling` → `walking`/`idle` once
     * `uncurl` finishes. Reassigning `status` inside these branches is
     * itself the guard against re-firing on every subsequent tick the
     * animation holds on its last frame, since the status check above no
     * longer matches once it's changed.
     *
     * @param frame - The frame just stepped to.
     */
    protected override onFrameAdvanced(frame: SpriteFrame): void {
        if (this.status === "sleepTurning") {
            this.sleepTurnPhasesRemaining--;
            if (this.sleepTurnPhasesRemaining <= 0) {
                this.status = "sleeping";
            }
            return;
        }
        if (frame.loops || frame.frameIndex !== frame.frameCount - 1) {
            return;
        }
        if (this.status === "curling") {
            this.status = "sleeping";
        } else if (this.status === "uncurling") {
            this.finishWaking();
        }
    }

    private isRestState(): boolean {
        return this.status === "curling" || this.status === "sleeping"
            || this.status === "uncurling" || this.status === "sleepTurning";
    }

    /**
     * Triggers a one-off `sleepTurn` in response to `Z` while `sleeping`:
     * one full lap of the row (it's designed to loop cleanly, per
     * `docs/fox-sprite-design.md`), starting from - and, since a full lap
     * ends where it began, also finishing back at - the fox's current
     * sleeping rotation, rather than resetting to {@link CURL_ART_FACING}.
     */
    private beginSleepTurn(): void {
        const rotation = this.getCurrentFrame().rotation ?? 0;
        const frame = this.foxSpriteSheet.locateSprite("sleepTurn");
        this.sleepTurnPhasesRemaining = frame.frameCount;
        this.status = "sleepTurning";
        this.setCurrentFrame({...frame, rotation});
    }

    /**
     * The rotation (radians) to draw a {@link CURL_ART_FACING}-drawn frame
     * with so it visually faces `direction` instead.
     *
     * @param direction - Direction the frame should appear to face.
     */
    private rotationFor(direction: CompassDirection): number {
        return Vector2d.fromDirection(direction).angleRadians() - CURL_ART_ANGLE;
    }

    /**
     * Starts the `uncurl` animation in response to a movement key press
     * while `curling`/`sleeping`. If already mid-`curling`, continues the
     * tail sweep from its current phase rather than restarting from `uncurl`'s
     * first frame, since both rows share the same phase count and sweep
     * direction. Rotated to face the direction being woken up into (from
     * {@link pendingWakeFacing}), which may differ from the direction the fox
     * fell asleep facing.
     *
     * @param velocity - Velocity to resume with once `uncurl` finishes.
     */
    private beginWaking(velocity: Vector2d): void {
        this.pendingWakeVelocity = velocity;
        const startPhase = this.status === "curling" ? this.getCurrentFrame().frameIndex + 1 : 1;
        const wakeFacing = this.pendingWakeFacing ?? this.facing;
        this.status = "uncurling";
        this.setCurrentFrame({
            ...this.foxSpriteSheet.locateSprite("uncurl", startPhase),
            rotation: this.rotationFor(wakeFacing),
        });
    }

    /**
     * Applies whatever facing/velocity a movement key press requested while
     * the fox was asleep/waking, now that `uncurl` has finished.
     */
    private finishWaking(): void {
        const velocity = this.pendingWakeVelocity ?? Vector2d.ZERO;
        this.facing = this.pendingWakeFacing ?? this.facing;
        this.pendingWakeVelocity = null;
        this.pendingWakeFacing = null;

        const moving = velocity.x !== 0 || velocity.y !== 0;
        this.status = moving ? "walking" : "idle";
        this.setFrameForFacing(this.facing, moving);
        this.setVelocity(velocity);
    }
}
