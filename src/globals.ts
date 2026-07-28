import {WorldController} from "./world-controller";
import {ChunkWorkerClient} from "./world/generation/chunk/chunk-worker-client";
import {World} from "./world/world";
import {FieldRegistry, fieldRegistry} from "./fields/field-registry";

declare global {
    interface Window {
        /** The running game's {@link WorldController}, for inspection from the browser console. */
        worldController: WorldController;
        /** The worker client driving chunk generation, for inspection/control from the browser console (e.g. `chunkGenerationQueue.setMinGenerationDelayMs(500)`). */
        chunkGenerationQueue: ChunkWorkerClient;
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
    window.chunkGenerationQueue = worldController.getChunkWorkerClient();
    window.world = worldController.getWorld();
    window.fields = fieldRegistry;
}
