import {MovableEntity} from "./movable-entity";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";
import {Camera} from "../camera/camera";
import {KeyBinding} from "../help/key-binding";
import {Debouncer} from "../input/debouncer";
import {Keyboard} from "@keyboard";
import {requireNonNull} from "../util";
import {SPECTATOR_CONSTANTS} from '../world/spectator-constants';

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
 * keys.
 */
export class MovementController {
    private readonly movementDebouncer: Debouncer;
    private spectating = false;

    /** Arrow keys currently held that were double-tapped, so movement in their direction runs. */
    private readonly runningKeys = new Set<string>();

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
        this.movementDebouncer = new Debouncer(10, () => {
            this.applyMovement();
        });
        keyboard.onKeyDown(this.handleKeyDown);
        keyboard.onKeyUp(this.handleKeyUp);
        if (this.entity) this.setMovableEntity(this.entity);
    }

    /** Get the debounce delay used for the keyboard input. */
    public getDebounceMs(): number {
        return this.movementDebouncer.getDelayMs();
    }

    /** Set the debounce delay for keyboard input. */
    public setDebounceMs(delayMs: number): void {
        this.movementDebouncer.setDelayMs(delayMs);
    }

    /**
     * Binds this controller to a different entity, or unbinds it entirely,
     * returning `this` so setup can be chained.
     *
     * @param entity - Entity to bind to, or `null` to unbind.
     * @returns `this`, for chaining.
     */
    public setMovableEntity(entity: MovableEntity | null): this {
        if (this.entity?.canDash()) {
            this.entity.stopDash();
        }
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
     * field registry once this controller (and its bound
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
        } else if (this.entity?.canDash()) {
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
        if (this.entity?.canDash()) {
            const wasDashing = this.entity.isDashing();
            this.entity.tickDash(deltaMs);
            if (wasDashing && !this.entity.isDashing() && !this.spectating) {
                this.applyMovement();
            }
        }

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
     * unless spectator mode is active.
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
        const speed = this.runningKeys.size > 0
            ? SPECTATOR_CONSTANTS.speed * SPECTATOR_CONSTANTS.runMultiplier
            : SPECTATOR_CONSTANTS.speed;
        return Vector2d.fromDirection(direction).scale(speed);
    }

    /**
     * Toggles spectator mode in response to the `s` key.
     */
    private toggleSpectatorMode(): void {
        this.spectating = !this.spectating;
        this.movementDebouncer.cancel();
        this.runningKeys.clear();
        if (this.spectating && this.entity) {
            this.entity.setVelocity(Vector2d.ZERO);
            if (this.entity.canDash()) {
                this.entity.stopDash();
            }
        }
    }

    /**
     * Snaps the camera to the entity's position.
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
        // edgeMargin is specified in screen pixels; getWidth/getHeight/getViewX/getViewY
        // are in world pixels, so convert by the current zoom to keep the margin's
        // on-screen size constant as the camera zooms in/out.
        const margin = requireNonNull(this.cameraFollow?.edgeMargin) / camera.getZoom();
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

    /** Restarts the debouncer. */
    private scheduleApplyMovement(): void {
        this.movementDebouncer.trigger();
    }

    /**
     * Recomputes the bound entity's facing/velocity from the currently
     * pressed arrow keys.
     */
    private applyMovement(): void {
        if (!this.entity || (this.entity.canDash() && this.entity.isDashing())) {
            return;
        }

        this.entity.setRunning?.(this.runningKeys.size > 0);

        const direction = this.resolveDirection();
        if (!direction) {
            this.entity.setVelocity(Vector2d.ZERO);
            return;
        }

        this.entity.setFacing(direction);
        this.entity.setVelocity(Vector2d.fromDirection(direction).scale(this.entity.getSpeed()));
    }

    /**
     * Handles a fresh `X` keydown.
     */
    private handleDashKeyDown(): void {
        if (this.spectating || !this.entity?.canDash() || !this.entity.readyToDash()) {
            return;
        }

        const direction = this.resolveDirection() ?? this.entity.getFacing();
        this.entity.setFacing(direction);
        this.entity.requestDash(direction);
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

    /** Called just before a teleport event. */
    public prepareToTeleport(): void {
        if (this.entity?.canDash()) {
            this.entity.stopDash();
        }
    }
}
