import {MovableEntity} from "./movable-entity";
import {FoxSpriteSheet, FoxSpriteType} from "../sprites/fox";
import {CompassDirection} from "../geometry/direction";
import {SpriteFrame} from "../sprites/sprite";
import {Vector2d} from "../geometry/vector2d";
import {KeyBinding} from "../help/key-binding";
import {DashEffectRequest} from "../effects/dash-effect";
import {FOX_CONSTANTS} from './fox-constants';
import type {DashableEntity} from './DashableEntity';

/** Behavioural states a {@link Fox} entity can be in. */
export type FoxStatus = "idle" | "walking" | "curling" | "sleeping" | "sleepTurning" | "uncurling" | "dashing";

/** Direction a fox faces when spawned. */
const INITIAL_FACING: CompassDirection = "N";

/** Direction the `curl`/`uncurl` art is drawn at. */
const CURL_ART_FACING: CompassDirection = "NW";
const CURL_ART_ANGLE = Vector2d.fromDirection(CURL_ART_FACING).angleRadians();

/** The fox entity: a {@link MovableEntity} that can be driven around by a {@link MovementController}. */
export class Fox extends MovableEntity<FoxSpriteType, FoxStatus> implements DashableEntity {
    /**
     * Same sheet instance as the base class's `spriteSheet` field, kept here
     * too so {@link locateFrameForFacing} can reach `FoxSpriteSheet`-specific
     * methods (like {@link FoxSpriteSheet.locateIdleSprite}) that aren't part
     * of the generic `AnimatedSpriteSheet` type that field is declared with.
     */
    private readonly foxSpriteSheet: FoxSpriteSheet;

    /**
     * Facing/velocity requested by a movement key press while asleep (or
     * mid-curl/mid-uncurl), held until the `uncurl` animation finishes so it
     * can be applied then instead of immediately.
     */
    private pendingWakeFacing: CompassDirection | null = null;
    private pendingWakeVelocity: Vector2d | null = null;

    /** Phases left to step through before a triggered `sleepTurn` returns to a static `sleeping` hold. */
    private sleepTurnPhasesRemaining = 0;

    /** Whether the bound {@link MovementController} currently has its run modifier active. */
    private running = false;

    /**
     * A dash requested while resting, held until `uncurl` completes so it can
     * launch then instead of immediately.
     */
    private pendingDash: {direction: CompassDirection} | null = null;

    /** Whether the fox is currently mid-dash. */
    private dashActive = false;

    /** Milliseconds left in the active dash. Only meaningful while {@link dashActive}. */
    private dashRemainingMs = 0;

    /** Milliseconds left before another dash may start, counted down once the previous one ends. */
    private dashCooldownRemainingMs = 0;

    public constructor() {
        const spriteSheet = new FoxSpriteSheet();
        super(spriteSheet, "idle", INITIAL_FACING, spriteSheet.locateIdleSprite(INITIAL_FACING), FOX_CONSTANTS.walkFrameMs);
        this.foxSpriteSheet = spriteSheet;
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
        if (this.isRestState() || this.status === "dashing") {
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

    public override getDisplayName(): string {
        return "Fox";
    }

    protected override getEntityTypeId(): string {
        return "fox";
    }

    override canDash(): this is DashableEntity {
        return true;
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

    public override setRunning(running: boolean): void {
        this.running = running;
        if (this.isRestState() || this.status === "dashing") {
            return;
        }
        this.setFrameIntervalMs(this.walkFrameIntervalMs());
    }

    public override getSpeed(): number {
        return this.running
            ? FOX_CONSTANTS.speed * FOX_CONSTANTS.runMultiplier
            : FOX_CONSTANTS.speed;
    }

    /**
     * The frame interval the walk animation should currently show at, per
     * {@link running}.
     */
    private walkFrameIntervalMs(): number {
        return this.running
            ? FOX_CONSTANTS.walkFrameMs / FOX_CONSTANTS.runMultiplier
            : FOX_CONSTANTS.walkFrameMs;
    }

    /**
     * `curling`/`uncurling`/`sleepTurning` all need continued frame-stepping
     * while stationary; `sleeping` itself is a static held pose.
     */
    protected override shouldAnimateWhileStationary(): boolean {
        return this.status === "curling" || this.status === "uncurling" || this.status === "sleepTurning"
            || this.status === "dashing";
    }

    protected override locateFrameForFacing(direction: CompassDirection, moving: boolean): SpriteFrame {
        return moving ? this.foxSpriteSheet.locateSprite(direction) : this.foxSpriteSheet.locateIdleSprite(direction);
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
     * while `curling`/`sleeping`. If already mid-`curling`, starts at the
     * mirrored `uncurl` phase so the body and tail take one step back toward
     * standing rather than jumping to the fully curled end. Rotated to face
     * the direction being woken up into (from
     * {@link pendingWakeFacing}), which may differ from the direction the fox
     * fell asleep facing.
     *
     * @param velocity - Velocity to resume with once `uncurl` finishes.
     */
    private beginWaking(velocity: Vector2d): void {
        this.pendingWakeVelocity = velocity;
        const currentFrame = this.getCurrentFrame();
        const startPhase = this.status === "curling" ? currentFrame.frameCount - currentFrame.frameIndex : 1;
        const wakeFacing = this.pendingWakeFacing ?? this.facing;
        this.status = "uncurling";
        this.setCurrentFrame({
            ...this.foxSpriteSheet.locateSprite("uncurl", startPhase),
            rotation: this.rotationFor(wakeFacing),
        });
    }

    /**
     * Applies whatever facing/velocity a movement key press requested while
     * the fox was asleep/waking, now that `uncurl` has finished. A queued
     * dash (see {@link requestDash}) takes priority over a queued ordinary
     * movement request.
     */
    private finishWaking(): void {
        if (this.pendingDash) {
            const {direction} = this.pendingDash;
            this.pendingDash = null;
            this.facing = this.pendingWakeFacing ?? this.facing;
            this.pendingWakeFacing = null;
            this.pendingWakeVelocity = null;
            this.status = "idle";
            this.startDash(direction);
            return;
        }

        const velocity = this.pendingWakeVelocity ?? Vector2d.ZERO;
        this.facing = this.pendingWakeFacing ?? this.facing;
        this.pendingWakeVelocity = null;
        this.pendingWakeFacing = null;

        const moving = velocity.x !== 0 || velocity.y !== 0;
        this.status = moving ? "walking" : "idle";
        this.setFrameIntervalMs(this.walkFrameIntervalMs());
        this.setCurrentFrame(this.locateFrameForFacing(this.facing, moving));
        this.setVelocity(velocity);
    }

    readyToDash(): boolean {
        return !this.dashActive && this.dashCooldownRemainingMs <= 0;
    }

    isDashing(): boolean {
        return this.dashActive;
    }

    public requestDash(direction: CompassDirection): void {
        if (!this.isRestState()) {
            this.startDash(direction);
            return;
        }
        this.pendingDash = {direction};
        if (this.status !== "uncurling") {
            this.beginWaking(Vector2d.ZERO);
        }
    }

    private startDash(direction: CompassDirection): void {
        this.dashActive = true;
        this.dashRemainingMs = FOX_CONSTANTS.dash.durationMs;
        this.setFacing(direction);
        this.setVelocity(Vector2d.fromDirection(direction).scale(FOX_CONSTANTS.speed * FOX_CONSTANTS.dash.speedMultiplier));

        this.status = "dashing";
        const frame = this.foxSpriteSheet.locateSprite(`dash${direction}`);
        this.setFrameIntervalMs(FOX_CONSTANTS.dash.durationMs / frame.frameCount);
        this.setCurrentFrame(frame);
        this.effectDispatcher.dispatch(new DashEffectRequest(this.getPosition(), Vector2d.fromDirection(direction)));
    }

    public tickDash(deltaMs: number): void {
        if (this.dashActive) {
            this.dashRemainingMs -= deltaMs;
            if (this.dashRemainingMs <= 0) {
                this.stopDash();
            }
            return;
        }

        if (this.dashCooldownRemainingMs > 0) {
            this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - deltaMs);
        }
    }

    public stopDash(): void {
        const isComplete = !this.pendingDash;

        this.pendingDash = null;
        this.dashActive = false;
        this.dashCooldownRemainingMs = isComplete
            ? FOX_CONSTANTS.dash.cooldownMs
            : 0;
        this.dashRemainingMs = 0;
        this.setVelocity(Vector2d.ZERO);

        if (isComplete || this.status === "dashing") {
            this.status = this.isMoving() ? "walking" : "idle";
            this.setFrameIntervalMs(this.walkFrameIntervalMs());
            this.setCurrentFrame(this.locateFrameForFacing(this.facing, this.isMoving()));
        }
    }
}
