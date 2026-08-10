import {WorldController} from "./world-controller";
import {CameraFollowMode} from "./entities/movement-controller";
import {fieldRegistry, integerRange, nonNegativeInteger} from "./fields/field-registry";
import {EntityLookupHandler} from "./entities/entity-lookup-handler";
import {keyboard} from './input/keyboard-instance';
import {pixelToTile, tileToPixel} from "./world/coordinates/world-grid-math";

/**
 * Registers per-instance tunable fields that only exist once
 * `worldController` has constructed its object graph.
 *
 * @param worldController - The running game's controller.
 */
export function registerDynamicFields(worldController: WorldController): void {
    const debugController = worldController.getDebugController();
    fieldRegistry.registerFields("debug", {
        get enabled(): boolean {
            return debugController.isEnabled();
        },
        set enabled(value: boolean) {
            debugController.setEnabled(value);
        }
    });

    fieldRegistry.registerHandler("world.entities", new EntityLookupHandler(worldController.getWorld()));

    const movementController = worldController.getMovementController();
    const cameraFollow = movementController.getCameraFollow();
    if (!cameraFollow) {
        return;
    }

    const tileSize = worldController.getWorld().tileSize;
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
            return pixelToTile(cameraFollow.camera.getCenter().x, tileSize);
        },
        set x(value: number) {
            cameraFollow.camera.setX(tileToPixel(value, tileSize));
        },
        get y(): number {
            return pixelToTile(cameraFollow.camera.getCenter().y, tileSize);
        },
        set y(value: number) {
            cameraFollow.camera.setY(tileToPixel(value, tileSize));
        },
    };
    fieldRegistry.registerFields("camera", cameraOptions, {
        edgeMargin: nonNegativeInteger(),
    });

    const world = worldController.getWorld();

    // different from 'world.spectator.*' properties, see spectator-constants.ts.
    fieldRegistry.registerFields("world", {
        get spectating(): boolean {
            return movementController.isSpectating();
        },
        set spectating(value: boolean) {
            movementController.setSpectating(value);
        },
        get seed(): number {
            return world.getWorldSeed();
        },
        set seed(value: number) {
            world.setWorldSeed(value);
        },
    }, {
        seed: integerRange(-Infinity, Infinity),
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
