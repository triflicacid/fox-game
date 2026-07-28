import {WorldController} from "./world-controller";
import {CameraFollowMode} from "./entities/movement-controller";
import {fieldRegistry, nonNegativeInteger} from "./fields/field-registry";
import {EntityLookupHandler} from "./world/entity-lookup-handler";
import {keyboard} from './input/keyboard-instance';

/**
 * Registers per-instance tunable fields that only exist once
 * `worldController` has constructed its object graph.
 *
 * @param worldController - The running game's controller.
 */
export function registerDynamicFields(worldController: WorldController): void {
    fieldRegistry.registerHandler("world.entities", new EntityLookupHandler(worldController.getWorld()));

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
    fieldRegistry.registerFields("camera", cameraOptions, {
        edgeMargin: nonNegativeInteger(),
    });

    // different from 'world.spectator.*' properties, see spectator-constants.ts.
    fieldRegistry.registerFields("world", {
        get spectating(): boolean {
            return movementController.isSpectating();
        },
        set spectating(value: boolean) {
            movementController.setSpectating(value);
        },
    });

    fieldRegistry.registerFields("input", {
        get debounceMs(): number {
            return movementController.getDebounceMs();
        },
        set debounceMs(value: number) {
            movementController.setDebounceMs(value);
        },
        get doubleTapWindowMs(): number {
            return keyboard.getConfig().doubleTapWindowMs;
        },
        set doubleTapWindowMs(value: number) {
            keyboard.getConfig().doubleTapWindowMs = value;
        }
    }, {
        debounceMs: nonNegativeInteger(),
        doubleTapWindowMs: nonNegativeInteger(),
    });
}
