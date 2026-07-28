import type {CompassDirection} from '../geometry/direction';

/** If the entity supports a dash mechanic. */
export interface DashableEntity {
    /** Can we commence a dash right now? */
    readyToDash(): boolean;

    /** Whether the entity is currently mid-dash. */
    isDashing(): boolean;

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
}
