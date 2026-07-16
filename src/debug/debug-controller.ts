import {KeyBinding} from "../help/key-binding";

/** Toggles debug rendering mode on/off in response to the `d` key. */
export class DebugController {
    private enabled = false;

    public constructor() {
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
     * This controller's key binding, for the help popup.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        return [{key: "D", description: "Toggle debug overlay"}];
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "d" && event.key !== "D") {
            return;
        }
        this.enabled = !this.enabled;
    };
}
