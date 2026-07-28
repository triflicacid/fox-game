import type {CompassDirection} from '../geometry/direction';
import {Vector2d} from '../geometry/vector2d';

/** Data used during the dash. */
export interface DashState {
    /** Whether the entity is currently mid-dash. */
    dashActive: boolean;
    /** Velocity to be used when dash is active. */
    dashVelocity: Vector2d;
    /** Milliseconds left in the active dash. Only meaningful while `dashActive`. */
    dashRemainingMs: number;
    /** Milliseconds left before another dash may start, counted down once the previous one ends. */
    dashCooldownRemainingMs: number;
}

/** Create a default/initial dash state */
export function createInitialDashState(): DashState {
    return {
        dashActive: false,
        dashVelocity: Vector2d.ZERO,
        dashRemainingMs: 0,
        dashCooldownRemainingMs: 0,
    } as DashState;
}

/** If the entity supports a dash mechanic. */
export interface DashableEntity {
    /** Can we commence a dash right now? */
    readyToDash(): boolean;

    /**
     * Called when a dash is requested.
     *
     * @param direction - Direction the dash was requested in.
     */
    requestDash(direction: CompassDirection): void;

    /**
     * Advances the active dash (or its cooldown) by `deltaMs`.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    tickDash(deltaMs: number): void;

    /** Stops the dash, whether it finished naturally or was interrupted. */
    stopDash(): void;

    /** Get the current dash state. Mutability is up to the implementer. */
    getDashState(): DashState;
}
