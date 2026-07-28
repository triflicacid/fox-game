import type {CompassDirection} from '../geometry/direction';

/** If the entity supports a dash mechanic. */
export interface DashableEntity {
    /**
     * Called when a dash is requested.
     *
     * @param direction - Direction the dash was requested in.
     * @param launch - Callback that actually starts the dash; the controller
     * owns dash timing/velocity from the moment this is called.
     */
    requestDash(direction: CompassDirection, launch: () => void): void;

    /**
     * Optional hook: called by {@link MovementController} the moment a
     * requested dash actually launches (i.e. when `launch` from
     * {@link requestDash} is invoked).
     *
     * @param direction - Direction the dash launched in.
     */
    onDashStart(direction: CompassDirection): void;

    /**
     * Optional hook: called by {@link MovementController} once an active
     * dash's duration has fully elapsed.
     */
    onDashComplete(): void;

    /**
     * Optional hook: called by {@link MovementController} when an active or
     * queued dash is cancelled.
     */
    onDashCancel(): void;
}
