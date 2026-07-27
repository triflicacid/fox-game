import {MovableEntity} from "./movable-entity";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";
import {Camera} from "../camera/camera";
import {KeyBinding} from "../help/key-binding";
import {Debouncer} from "../input/debouncer";
import {Keyboard} from "@keyboard";
import {DASH_CONSTANTS} from "./dash-constants";
import {MOVEMENT_CONSTANTS} from "./movement-constants";
import {requireNonNull} from "../util";

/** Arrow keys mapped to the compass direction each one contributes to movement. */
const KEY_DIRECTIONS: Record<string, CompassDirection> = {
    ArrowUp: "N",
    ArrowDown: "S",
    ArrowLeft: "W",
    ArrowRight: "E",
};

/**
 * How a bound {@link Camera} tracks the controlled entity:
 * - `"center"` - the camera is always centred on the entity.
 * - `"edge"` - the camera stays put until the entity nears the edge of the
 *   viewport, then drags along just enough to keep it within the margin.
 */
export type CameraFollowMode = "center" | "edge";

/** Configures a {@link MovementController}'s optional camera-following behaviour. */
export interface CameraFollowOptions {
    /** Camera to keep positioned around the bound entity. */
    camera: Camera;
    /** How the camera should track the entity. */
    mode: CameraFollowMode;
    /**
     * In `"edge"` mode, how close, in canvas pixels, the entity can get to
     * the viewport's edge before the camera starts dragging to keep up.
     * Must be present if `mode === "edge"`.
     */
    edgeMargin?: number;
}

/**
 * Drives a bound {@link MovableEntity}'s facing and velocity from the arrow
 * keys. Speed comes from {@link MOVEMENT_CONSTANTS}, which is live-editable
 * through the constants registry.
 */
export class MovementController {
    /** Speed the camera pans at in spectator mode, in world pixels per second. */
    private static readonly SPECTATOR_SPEED = 520;

    /**
     * How long, in milliseconds, to wait after a key event before actually
     * recomputing movement. The browser delivers a physical multi-key
     * release (e.g. letting go of both keys of a diagonal at once) as
     * separate `keyup` events a few milliseconds apart, not simultaneously;
     * without this delay, the moment in between them would be read as a
     * single-key press and briefly resolve to the wrong direction.
     */
    private static readonly DEBOUNCE_MS = 10;

    private readonly movementDebouncer: Debouncer;
    private spectating = false;

    /** Arrow keys currently held that were double-tapped, so movement in their direction runs. */
    private readonly runningKeys = new Set<string>();

    /** Whether the bound entity is currently mid-dash. */
    private dashActive = false;

    /** {@link dashActive}'s locked travel vector, scaled to dash speed. Only meaningful while `dashActive`. */
    private dashVelocity = Vector2d.ZERO;

    /** Milliseconds left in the active dash. Only meaningful while `dashActive`. */
    private dashRemainingMs = 0;

    /** Milliseconds left before another dash may start, counted down once the previous one ends. */
    private dashCooldownRemainingMs = 0;

    /**
     * @param keyboard - Shared keyboard state used for input queries and subscriptions.
     * @param entity - Entity to bind to initially. Defaults to unbound (`null`).
     * @param cameraFollow - Optional camera to keep positioned around the bound entity as it moves.
     */
    public constructor(
        private readonly keyboard: Keyboard,
        private entity: MovableEntity | null = null,
        private readonly cameraFollow: CameraFollowOptions | null = null
    ) {
        this.cameraFollow = cameraFollow;
        this.movementDebouncer = new Debouncer(MovementController.DEBOUNCE_MS, () => {
            this.applyMovement();
        });
        keyboard.onKeyDown(this.handleKeyDown);
        keyboard.onKeyUp(this.handleKeyUp);
        if (this.entity) this.setMovableEntity(this.entity);
    }

    /**
     * Binds this controller to a different entity, or unbinds it entirely,
     * returning `this` so setup can be chained.
     *
     * @param entity - Entity to bind to, or `null` to unbind.
     * @returns `this`, for chaining.
     */
    public setMovableEntity(entity: MovableEntity | null): this {
        this.cancelDash();
        this.entity = entity;
        this.applyMovement();
        this.update(0);
        return this;
    }

    /**
     * Whether spectator mode is currently active (toggled via the `s` key).
     *
     * @returns `true` if the camera is currently detached from the bound entity.
     */
    public isSpectating(): boolean {
        return this.spectating;
    }

    /**
     * Sets spectator mode.
     *
     * @param spectating - Whether spectator mode should be active.
     */
    public setSpectating(spectating: boolean): void {
        if (spectating !== this.spectating) {
            this.toggleSpectatorMode();
        }
    }

    /**
     * The bound camera's current follow mode, or `undefined` if this
     * controller has no {@link CameraFollowOptions} (i.e. it's not
     * following any camera).
     *
     * @returns The current {@link CameraFollowMode}, if any.
     */
    public getCameraFollowMode(): CameraFollowMode | undefined {
        return this.cameraFollow?.mode;
    }

    /**
     * This controller's camera-follow config, for wiring its fields into the
     * tunable-constants registry once this controller (and its bound
     * camera, if any) exist.
     *
     * @returns The bound {@link CameraFollowOptions}, or `null` if this controller isn't following a camera.
     */
    public getCameraFollow(): CameraFollowOptions | null {
        return this.cameraFollow;
    }

    /**
     * Changes how the bound camera follows the controlled entity. A no-op
     * if this controller has no {@link CameraFollowOptions}.
     *
     * @param mode - The {@link CameraFollowMode} to switch to.
     */
    public setCameraFollowMode(mode: CameraFollowMode): void {
        if (this.cameraFollow) {
            this.cameraFollow.mode = mode;
        }
    }

    /**
     * This controller's key bindings, for the help popup.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        const bindings: KeyBinding[] = [
            {key: "Arrow Keys", description: this.spectating ? "Pan camera" : "Move"},
            {key: "S", description: "Toggle spectator mode"},
        ];
        if (this.spectating) {
            bindings.push(
                {key: "F", description: "Focus camera on entity"},
                {key: "O", description: "Move camera to world origin"},
            );
        } else if (this.entity?.requestDash) {
            bindings.push({key: "X", description: "Dash"});
        }
        return bindings;
    }

    /**
     * Advances this controller by one animation frame. In spectator mode,
     * pans the bound {@link CameraFollowOptions.camera} directly from the
     * currently held arrow keys; otherwise repositions it around the bound
     * entity per {@link CameraFollowOptions.mode}. The entity moves
     * continuously (driven by its velocity each simulation tick, not just on
     * key events), so callers should invoke this once per animation frame -
     * e.g. alongside {@link World.update} - rather than only after a key event.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    public update(deltaMs: number): void {
        this.tickDash(deltaMs);

        if (!this.cameraFollow) {
            return;
        }

        if (this.spectating) {
            this.panCamera(this.cameraFollow.camera, deltaMs);
        } else if (this.entity) {
            this.followEntity(this.cameraFollow, this.entity);
        }
    }

    /**
     * Repositions `cameraFollow`'s camera around `entity`'s current
     * position, per {@link CameraFollowOptions.mode}.
     *
     * @param cameraFollow - Camera-follow options to reposition the camera per.
     * @param entity - Entity to follow.
     */
    private followEntity(cameraFollow: CameraFollowOptions, entity: MovableEntity): void {
        const entityPosition = entity.getPosition();
        if (cameraFollow.mode === "center") {
            cameraFollow.camera.setCenter(entityPosition);
        } else {
            this.dragCameraToEdge(cameraFollow.camera, entityPosition);
        }
    }

    /**
     * Pans `camera` by {@link getSpectatorVelocity}, scaled by the elapsed
     * frame time.
     *
     * @param camera - Camera to pan.
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    private panCamera(camera: Camera, deltaMs: number): void {
        camera.pan(this.getSpectatorVelocity().scale(deltaMs / 1000));
    }

    /**
     * This controller's current spectator-mode camera-pan velocity: zero
     * unless spectator mode is active and at least one arrow key is
     * currently held, in which case it's {@link SPECTATOR_SPEED} (scaled by
     * {@link RUN_MULTIPLIER} if double-tapped) in the held direction.
     *
     * @returns The current spectator pan velocity, in world pixels per second.
     */
    public getSpectatorVelocity(): Vector2d {
        if (!this.spectating) {
            return Vector2d.ZERO;
        }
        const direction = this.resolveDirection();
        if (!direction) {
            return Vector2d.ZERO;
        }
        return Vector2d.fromDirection(direction).scale(this.applyRunMultiplier(MovementController.SPECTATOR_SPEED));
    }

    /**
     * Toggles spectator mode in response to the `s` key: detaches the
     * camera from the bound entity (or reattaches it), and resets any
     * in-flight arrow-key state so it isn't misread by the other mode. The
     * bound entity is stopped when entering spectator mode, since arrow keys
     * drive the camera instead of it while active.
     */
    private toggleSpectatorMode(): void {
        this.spectating = !this.spectating;
        this.movementDebouncer.cancel();
        this.runningKeys.clear();
        if (this.spectating) {
            this.entity?.setVelocity(Vector2d.ZERO);
            this.cancelDash();
        }
    }

    /**
     * In spectator mode, snaps {@link CameraFollowOptions.camera} straight
     * to the bound entity's centre, in response to the `f` key. A no-op if
     * there's no bound entity or camera.
     */
    private focusOnEntity(): void {
        if (!this.cameraFollow || !this.entity) {
            return;
        }
        this.cameraFollow.camera.setCenter(this.entity.getPosition());
    }

    /**
     * In spectator mode, snaps {@link CameraFollowOptions.camera} straight
     * to the world origin, in response to the `o` key. A no-op if there's no
     * bound camera.
     */
    private moveCameraToOrigin(): void {
        if (!this.cameraFollow) {
            return;
        }
        this.cameraFollow.camera.setCenter(Vector2d.ZERO);
    }

    /**
     * Pans `camera` by the minimum amount needed to keep `entityPosition`
     * within {@link CameraFollowOptions.edgeMargin} of the viewport's edge,
     * leaving the camera untouched if the entity is already within margin.
     *
     * @param camera - Camera to drag.
     * @param entityPosition - World-space point being tracked.
     */
    private dragCameraToEdge(camera: Camera, entityPosition: Vector2d): void {
        const margin = requireNonNull(this.cameraFollow?.edgeMargin);
        const screenX = entityPosition.x - camera.getViewX();
        const screenY = entityPosition.y - camera.getViewY();

        let dx = 0;
        if (screenX < margin) {
            dx = screenX - margin;
        } else if (screenX > camera.getWidth() - margin) {
            dx = screenX - (camera.getWidth() - margin);
        }

        let dy = 0;
        if (screenY < margin) {
            dy = screenY - margin;
        } else if (screenY > camera.getHeight() - margin) {
            dy = screenY - (camera.getHeight() - margin);
        }

        if (dx !== 0 || dy !== 0) {
            camera.pan(new Vector2d(dx, dy));
        }
    }

    private readonly handleKeyDown = (event: KeyboardEvent, key: string, doubleTap: boolean): void => {
        if (event.key === "s" || event.key === "S") {
            this.toggleSpectatorMode();
            return;
        }
        if (this.spectating && (event.key === "f" || event.key === "F")) {
            this.focusOnEntity();
            return;
        }
        if (this.spectating && (event.key === "o" || event.key === "O")) {
            this.moveCameraToOrigin();
            return;
        }
        if ((event.key === "x" || event.key === "X") && !event.repeat) {
            this.handleDashKeyDown();
            return;
        }

        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) {
            this.entity?.handleKeyPress?.(event.key);
            return;
        }
        if (doubleTap) {
            this.runningKeys.add(key);
        }
        if (!this.spectating) {
            this.scheduleApplyMovement();
        }
    };

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        if (!KEY_DIRECTIONS[event.key]) {
            return;
        }
        this.runningKeys.delete(event.key);
        if (!this.spectating) {
            this.scheduleApplyMovement();
        }
    };

    /**
     * Restarts a {@link DEBOUNCE_MS} timer, so a burst of key events fired in
     * quick succession settles to a single {@link applyMovement} call
     * against the final key state, rather than also acting on whatever
     * transient states occur in between them.
     */
    private scheduleApplyMovement(): void {
        this.movementDebouncer.trigger();
    }

    /**
     * Recomputes the bound entity's facing/velocity from the currently
     * pressed arrow keys. Moves at {@link SPEED} scaled by
     * {@link RUN_MULTIPLIER} if any currently held arrow key was
     * double-tapped, regardless of whether the resolved direction is
     * cardinal or diagonal.
     */
    private applyMovement(): void {
        if (!this.entity || this.dashActive) {
            return;
        }

        this.entity.setRunning?.(this.runningKeys.size > 0);

        const direction = this.resolveDirection();
        if (!direction) {
            this.entity.setVelocity(Vector2d.ZERO);
            return;
        }

        const speed = this.applyRunMultiplier(MOVEMENT_CONSTANTS.speed);
        this.entity.setFacing(direction);
        this.entity.setVelocity(Vector2d.fromDirection(direction).scale(speed));
    }

    /**
     * Scales `speed` by {@link RUN_MULTIPLIER} if any currently held arrow
     * key was double-tapped, otherwise returns it unchanged.
     *
     * @param speed - Base speed, in world pixels per second.
     * @returns `speed`, scaled up if currently running.
     */
    private applyRunMultiplier(speed: number): number {
        return this.runningKeys.size > 0 ? speed * MOVEMENT_CONSTANTS.runMultiplier : speed;
    }

    /**
     * Handles a fresh (non-repeat) `X` keydown: resolves the dash direction
     * from currently held arrow keys (falling back to the entity's current
     * facing), then asks the entity to dash - immediately if it can, or
     * later if it needs to defer (see {@link MovableEntity.requestDash}). A
     * no-op while spectating, unbound, cooling down, or already dashing, or
     * if the bound entity isn't dashable at all.
     */
    private handleDashKeyDown(): void {
        if (this.spectating || !this.entity?.requestDash) {
            return;
        }
        if (this.dashActive || this.dashCooldownRemainingMs > 0) {
            return;
        }

        const direction = this.resolveDirection() ?? this.entity.getFacing();
        this.entity.setFacing(direction);
        this.entity.requestDash(direction, () => this.launchDash(direction));
    }

    /**
     * Actually starts a dash: locks in its travel vector and duration, zeroes
     * the entity's velocity so {@link MovableEntity.update}'s own
     * velocity-based movement doesn't also move it, then notifies the entity
     * so it can switch to its dash presentation. Called either immediately
     * from {@link handleDashKeyDown}, or later via the `launch` callback
     * passed to {@link MovableEntity.requestDash}.
     *
     * @param direction - Direction to dash in.
     */
    private launchDash(direction: CompassDirection): void {
        if (!this.entity) {
            return;
        }

        this.dashActive = true;
        this.dashRemainingMs = DASH_CONSTANTS.durationMs;
        this.dashVelocity = Vector2d.fromDirection(direction).scale(MOVEMENT_CONSTANTS.speed * DASH_CONSTANTS.speedMultiplier);
        this.entity.setFacing(direction);
        this.entity.setVelocity(Vector2d.ZERO);
        this.entity.onDashStart?.(direction);
    }

    /**
     * Advances the active dash (or its cooldown) by `deltaMs`. Moves the
     * entity directly by {@link dashVelocity} rather than through its normal
     * velocity-driven movement, clamping the elapsed time to whatever's left
     * of the dash so an unusually long frame can't extend its travel
     * distance beyond the configured burst.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    private tickDash(deltaMs: number): void {
        if (this.dashActive) {
            const usedMs = Math.min(deltaMs, this.dashRemainingMs);
            if (this.entity) {
                this.entity.teleportTo(this.entity.getPosition().add(this.dashVelocity.scale(usedMs / 1000)));
            }
            this.dashRemainingMs -= usedMs;
            if (this.dashRemainingMs <= 0) {
                this.endDash();
            }
            return;
        }

        if (this.dashCooldownRemainingMs > 0) {
            this.dashCooldownRemainingMs = Math.max(0, this.dashCooldownRemainingMs - deltaMs);
        }
    }

    /**
     * Ends the active dash once its duration has elapsed: starts the
     * cooldown, immediately recomputes normal movement from currently held
     * keys, then notifies the entity so it can return to its usual
     * presentation.
     */
    private endDash(): void {
        this.dashActive = false;
        this.dashCooldownRemainingMs = DASH_CONSTANTS.cooldownMs;
        this.applyMovement();
        this.entity?.onDashComplete?.();
    }

    /**
     * Cancels any active or queued dash (e.g. entering spectator mode,
     * rebinding to another entity) and notifies the entity, clearing its own
     * dash bookkeeping regardless of whether a dash was actually active, since
     * the bound entity may itself be holding a queued dash the controller
     * doesn't know about.
     */
    public cancelDash(): void {
        this.dashActive = false;
        this.dashRemainingMs = 0;
        this.dashCooldownRemainingMs = 0;
        this.entity?.onDashCancel?.();
    }

    /**
     * Combines the currently pressed arrow keys into a single compass
     * direction (e.g. up + right becomes north-east). Opposite keys held
     * together (e.g. up + down) cancel out on that axis.
     *
     * @returns The combined direction, or `undefined` if nothing is pressed.
     */
    private resolveDirection(): CompassDirection | undefined {
        const up = this.keyboard.hasKeyPressed("ArrowUp");
        const down = this.keyboard.hasKeyPressed("ArrowDown");
        const left = this.keyboard.hasKeyPressed("ArrowLeft");
        const right = this.keyboard.hasKeyPressed("ArrowRight");

        const vertical = up === down ? "" : (up ? "N" : "S");
        const horizontal = left === right ? "" : (left ? "W" : "E");
        const combined = vertical + horizontal;

        return combined === "" ? undefined : (combined as CompassDirection);
    }
}
