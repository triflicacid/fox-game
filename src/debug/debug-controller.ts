import {KeyBinding} from "../help/key-binding";

/**
 * Toggles debug rendering mode on/off in response to the `d` key.
 */
export class DebugController {
    private enabled = false;

    /**
     * @param onReloadChunks - Called when the `r` key is pressed while debug mode is enabled.
     * @param onTeleportToCamera - Called when the `t` key is pressed while debug mode and spectator mode are both enabled.
     * @param isSpectating - Reports whether spectator mode is currently active, so `onTeleportToCamera` only fires alongside it.
     */
    public constructor(
        private readonly onReloadChunks: () => void,
        private readonly onTeleportToCamera: () => void,
        private readonly isSpectating: () => boolean,
    ) {
        window.addEventListener("keydown", this.handleKeyDown);
    }

    /**
     * Whether debug rendering mode is currently on.
     *
     * @returns `true` if debug mode is enabled.
     */
    public isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Sets debug rendering mode.
     *
     * @param enabled - Whether debug rendering mode should be on.
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * This controller's key bindings.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        const bindings: KeyBinding[] = [{key: "D", description: "Toggle debug overlay"}];
        if (this.enabled) {
            bindings.push({key: "R", description: "Reload all chunks"});
            if (this.isSpectating()) {
                bindings.push({key: "T", description: "Teleport to camera"});
            }
        }
        return bindings;
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "d" || event.key === "D") {
            this.enabled = !this.enabled;
            return;
        }
        if (!this.enabled) {
            return;
        }
        if (event.key === "r" || event.key === "R") {
            this.onReloadChunks();
        } else if ((event.key === "t" || event.key === "T") && this.isSpectating()) {
            this.onTeleportToCamera();
        }
    };
}
