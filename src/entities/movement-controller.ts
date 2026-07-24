import {MovableEntity} from "./movable-entity";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";
import {Camera} from "../camera/camera";
import {KeyBinding} from "../help/key-binding";
import {Debouncer} from "../input/debouncer";

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
     * Defaults to {@link MovementController.DEFAULT_EDGE_MARGIN}.
     */
    edgeMargin?: number;
}

/**
 * Drives a bound {@link MovableEntity}'s facing and velocity from the arrow
 * keys. Not tied to a single entity for its lifetime: {@link bind} can point
 * it at a different entity later, e.g. when the player switches control to
 * something else.
 */
export class MovementController {
    /** Speed a bound entity moves at, in world pixels per second. */
    private static readonly SPEED = 250;

    /** Speed the camera pans at in spectator mode, in world pixels per second. */
    private static readonly SPECTATOR_SPEED = 520;

    /** Default {@link CameraFollowOptions.edgeMargin} for `"edge"` follow mode. */
    private static readonly DEFAULT_EDGE_MARGIN = 200;

    /**
     * How long, in milliseconds, to wait after a key event before actually
     * recomputing movement. The browser delivers a physical multi-key
     * release (e.g. letting go of both keys of a diagonal at once) as
     * separate `keyup` events a few milliseconds apart, not simultaneously;
     * without this delay, the moment in between them would be read as a
     * single-key press and briefly resolve to the wrong direction.
     */
    private static readonly DEBOUNCE_MS = 10;

    private readonly pressedDirections = new Set<CompassDirection>();
    private entity: MovableEntity | null;
    private readonly movementDebouncer: Debouncer;
    private readonly cameraFollow: CameraFollowOptions | null;
    private spectating = false;

    /**
     * @param entity - Entity to bind to initially. Defaults to unbound (`null`).
     * @param cameraFollow - Optional camera to keep positioned around the bound entity as it moves.
     */
    public constructor(entity: MovableEntity | null = null, cameraFollow: CameraFollowOptions | null = null) {
        this.entity = entity;
        this.cameraFollow = cameraFollow;
        this.movementDebouncer = new Debouncer(MovementController.DEBOUNCE_MS, () => {
            this.applyMovement();
        });
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
    }

    /**
     * Binds this controller to a different entity, or unbinds it entirely.
     * The previously bound entity keeps whatever velocity it last had -
     * callers switching control away from it should stop it themselves if
     * that's not the desired behaviour.
     *
     * @param entity - Entity to bind to, or `null` to unbind.
     */
    public bind(entity: MovableEntity | null): void {
        this.entity = entity;
        this.applyMovement();
        this.update(0);
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
        const entityCenter = this.getEntityCenter(entity);
        if (cameraFollow.mode === "center") {
            cameraFollow.camera.setCenter(entityCenter);
        } else {
            this.dragCameraToEdge(cameraFollow.camera, entityCenter);
        }
    }

    /**
     * Pans `camera` from the currently held arrow keys, at
     * {@link SPECTATOR_SPEED}, scaled by the elapsed frame time.
     *
     * @param camera - Camera to pan.
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    private panCamera(camera: Camera, deltaMs: number): void {
        const direction = this.resolveDirection();
        if (!direction) {
            return;
        }
        const distance = MovementController.SPECTATOR_SPEED * (deltaMs / 1000);
        camera.pan(Vector2d.fromDirection(direction).scale(distance));
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
        this.pressedDirections.clear();
        this.movementDebouncer.cancel();
        if (this.spectating) {
            this.entity?.setVelocity(Vector2d.ZERO);
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
        this.cameraFollow.camera.setCenter(this.getEntityCenter(this.entity));
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
     * The world-space midpoint of an entity's current sprite, used as the
     * point the camera tracks (rather than the entity's top-left {@link
     * MovableEntity.getPosition}).
     *
     * @param entity - Entity to find the centre point of.
     * @returns The entity's centre point, in world pixels.
     */
    private getEntityCenter(entity: MovableEntity): Vector2d {
        const frame = entity.getCurrentFrame();
        return entity.getPosition().add(new Vector2d(frame.w / 2, frame.h / 2));
    }

    /**
     * Pans `camera` by the minimum amount needed to keep `entityCenter`
     * within {@link CameraFollowOptions.edgeMargin} of the viewport's edge,
     * leaving the camera untouched if the entity is already within margin.
     *
     * @param camera - Camera to drag.
     * @param entityCenter - World-space point being tracked.
     */
    private dragCameraToEdge(camera: Camera, entityCenter: Vector2d): void {
        const margin = this.cameraFollow?.edgeMargin ?? MovementController.DEFAULT_EDGE_MARGIN;
        const screenX = entityCenter.x - camera.getViewX();
        const screenY = entityCenter.y - camera.getViewY();

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

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
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

        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) {
            this.entity?.handleKeyPress?.(event.key);
            return;
        }
        this.pressedDirections.add(direction);
        if (!this.spectating) {
            this.scheduleApplyMovement();
        }
    };

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) {
            return;
        }
        this.pressedDirections.delete(direction);
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
     * pressed arrow keys.
     */
    private applyMovement(): void {
        if (!this.entity) {
            return;
        }

        const direction = this.resolveDirection();
        if (!direction) {
            this.entity.setVelocity(Vector2d.ZERO);
            return;
        }

        this.entity.setFacing(direction);
        this.entity.setVelocity(Vector2d.fromDirection(direction).scale(MovementController.SPEED));
    }

    /**
     * Combines the currently pressed arrow keys into a single compass
     * direction (e.g. up + right becomes north-east). Opposite keys held
     * together (e.g. up + down) cancel out on that axis.
     *
     * @returns The combined direction, or `undefined` if nothing is pressed.
     */
    private resolveDirection(): CompassDirection | undefined {
        const up = this.pressedDirections.has("N");
        const down = this.pressedDirections.has("S");
        const left = this.pressedDirections.has("W");
        const right = this.pressedDirections.has("E");

        const vertical = up === down ? "" : (up ? "N" : "S");
        const horizontal = left === right ? "" : (left ? "W" : "E");
        const combined = vertical + horizontal;

        return combined === "" ? undefined : (combined as CompassDirection);
    }
}
