import {WorldController} from "./world-controller";
import {ChunkWorkerClient} from "./world/generation/chunk-worker-client";

declare global {
    interface Window {
        /** The running game's {@link WorldController}, for inspection from the browser console. */
        worldController: WorldController;
        /** The worker client driving chunk generation, for inspection/control from the browser console (e.g. `chunkGenerationQueue.setMinGenerationDelayMs(500)`). */
        chunkGenerationQueue: ChunkWorkerClient;
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
}
