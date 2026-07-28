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

/** Called when a dash is concluded, naturally or forcefully. */
export type DashFinishedCallback = (wasCancelled: boolean) => void;

/** If the entity supports a dash mechanic. */
export interface DashableEntity {
    /**
     * Called when a dash is requested.
     *
     * @param direction - Direction the dash was requested in.
     * @param onDashEnd - Call this when the dash is finished, either naturally or forcefully.
     */
    requestDash(direction: CompassDirection, onDashEnd?: DashFinishedCallback): void;

    /**
     * Advances the active dash (or its cooldown) by `deltaMs`.
     *
     * @param deltaMs - Time elapsed since the last update, in milliseconds.
     */
    tickDash(deltaMs: number): void;

    /** Used to stop the dash. If silent, will not call the callback. */
    stopDash(silent: boolean): void;

    /** Get the current dash state. Mutability is up to the implementer. */
    getDashState(): DashState;
}
