import {WorldController} from "./world-controller";
import type {ChunkStreamingManager} from "./world/chunks/chunk-streaming-manager";
import type {World} from "./world/world";
import {FieldRegistry, fieldRegistry} from "./fields/field-registry";

declare global {
    interface Window {
        /** The running game's {@link WorldController}, for inspection from the browser console. */
        worldController: WorldController;
        /** The chunk-streaming manager, for inspection/control from the browser console (e.g. `chunkStreamingManager.setMinGenerationDelayMs(500)`). */
        chunkStreamingManager: ChunkStreamingManager;
        /** The running game's {@link World}, for inspection/control from the browser console. */
        world: World;
        /** The tunable-field registry, for inspection/editing from the browser console (e.g. `fields.set("demo.plainValue", 100)`). */
        fields: FieldRegistry;
    }
}

/**
 * Attaches debugging handles onto `globalThis` for inspection from the
 * browser console.
 *
 * @param worldController - The running game's controller.
 */
export function exposeGlobals(worldController: WorldController): void {
    window.worldController = worldController;
    window.chunkStreamingManager = worldController.getChunkStreamingManager();
    window.world = worldController.getWorld();
    window.fields = fieldRegistry;
}
