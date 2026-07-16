import {MovableEntity} from "./movable-entity";
import {CompassDirection} from "../geometry/direction";
import {Vector2d} from "../geometry/vector2d";

/** Arrow keys mapped to the compass direction each one contributes to movement. */
const KEY_DIRECTIONS: Record<string, CompassDirection> = {
    ArrowUp: "N",
    ArrowDown: "S",
    ArrowLeft: "W",
    ArrowRight: "E",
};

/**
 * Drives a bound {@link MovableEntity}'s facing and velocity from the arrow
 * keys. Not tied to a single entity for its lifetime: {@link bind} can point
 * it at a different entity later, e.g. when the player switches control to
 * something else.
 */
export class MovementController {
    /** Speed a bound entity moves at, in world pixels per second. */
    private static readonly SPEED = 150;

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
    private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;

    /**
     * @param entity - Entity to bind to initially. Defaults to unbound (`null`).
     */
    public constructor(entity: MovableEntity | null = null) {
        this.entity = entity;
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
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) {
            return;
        }
        this.pressedDirections.add(direction);
        this.scheduleApplyMovement();
    };

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        const direction = KEY_DIRECTIONS[event.key];
        if (!direction) {
            return;
        }
        this.pressedDirections.delete(direction);
        this.scheduleApplyMovement();
    };

    /**
     * Restarts a {@link DEBOUNCE_MS} timer, so a burst of key events fired in
     * quick succession settles to a single {@link applyMovement} call
     * against the final key state, rather than also acting on whatever
     * transient states occur in between them.
     */
    private scheduleApplyMovement(): void {
        if (this.debounceTimeoutId !== null) {
            clearTimeout(this.debounceTimeoutId);
        }
        this.debounceTimeoutId = setTimeout(() => {
            this.debounceTimeoutId = null;
            this.applyMovement();
        }, MovementController.DEBOUNCE_MS);
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
