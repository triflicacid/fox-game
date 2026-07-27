import {WorldController} from "./world-controller";
import {CameraFollowMode} from "./entities/movement-controller";
import {constantRegistry, nonNegativeInteger} from "./constants/constant-registry";

/**
 * Registers per-instance tunable constants that only exist once
 * `worldController` has constructed its object graph.
 *
 * Note that `x`/`y` only stay put while `spectating` is `true`: in normal
 * play, {@link MovementController.update} repositions the camera around the
 * bound entity every frame (per `mode`/`edgeMargin`), which would otherwise
 * fight a manual edit on the very next frame.
 *
 * @param worldController - The running game's controller.
 */
export function registerDynamicFields(worldController: WorldController): void {
    const movementController = worldController.getMovementController();
    const cameraFollow = movementController.getCameraFollow();
    if (!cameraFollow) {
        return;
    }

    const cameraOptions = {
        get mode(): CameraFollowMode {
            return cameraFollow.mode;
        },
        set mode(value: CameraFollowMode) {
            cameraFollow.mode = value;
        },
        get edgeMargin(): number {
            return cameraFollow.edgeMargin ?? 0;
        },
        set edgeMargin(value: number) {
            cameraFollow.edgeMargin = value;
        },
        get spectating(): boolean {
            return movementController.isSpectating();
        },
        set spectating(value: boolean) {
            movementController.setSpectating(value);
        },
        get x(): number {
            return cameraFollow.camera.getCenter().x;
        },
        set x(value: number) {
            cameraFollow.camera.setX(value);
        },
        get y(): number {
            return cameraFollow.camera.getCenter().y;
        },
        set y(value: number) {
            cameraFollow.camera.setY(value);
        },
    };
    constantRegistry.registerConstants("world.camera", cameraOptions, {
        edgeMargin: nonNegativeInteger(),
    });
}
