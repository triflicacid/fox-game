import {KeyBinding} from "../help/key-binding";

/**
 * Toggles debug rendering mode on/off in response to the `d` key.
 */
export class DebugController {
    private enabled = false;

    /**
     * @param onReloadChunks - Called when the `r` key is pressed while debug mode is enabled.
     */
    public constructor(private readonly onReloadChunks: () => void) {
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
        }
        return bindings;
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "d" || event.key === "D") {
            this.enabled = !this.enabled;
            return;
        }
        if (this.enabled && (event.key === "r" || event.key === "R")) {
            this.onReloadChunks();
        }
    };
}
