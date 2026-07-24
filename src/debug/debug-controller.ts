import {KeyBinding} from "../help/key-binding";
import {Keyboard} from "@keyboard";

/**
 * Toggles debug rendering mode on/off in response to the `d` key.
 */
export class DebugController {
    private enabled = false;

    /**
     * @param keyboard - Shared keyboard state used to observe debug hotkeys.
     * @param onReloadChunks - Called when the `r` key is pressed while debug mode is enabled.
     * @param onTeleportToCamera - Called when the `t` key is pressed while debug mode and spectator mode are both enabled.
     * @param isSpectating - Reports whether spectator mode is currently active, so `onTeleportToCamera` only fires alongside it.
     */
    public constructor(
        keyboard: Keyboard,
        private readonly onReloadChunks: () => void,
        private readonly onTeleportToCamera: () => void,
        private readonly isSpectating: () => boolean,
    ) {
        keyboard.onKeyDownForKey("d", this.toggleDebugOverlay, {caseInsensitive: true});
        keyboard.onKeyDownForKey("r", this.handleReloadChunks, {caseInsensitive: true});
        keyboard.onKeyDownForKey("t", this.handleTeleportToCamera, {caseInsensitive: true});
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

    private readonly toggleDebugOverlay = (): void => {
        this.enabled = !this.enabled;
    };

    private readonly handleReloadChunks = (): void => {
        if (this.enabled) {
            this.onReloadChunks();
        }
    };

    private readonly handleTeleportToCamera = (): void => {
        if (this.enabled && this.isSpectating()) {
            this.onTeleportToCamera();
        }
    };
}
