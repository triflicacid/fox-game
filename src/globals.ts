import {WorldController} from "./world-controller";

declare global {
    interface Window {
        /** The running game's {@link WorldController}, for inspection from the browser console. */
        worldController: WorldController;
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
}
