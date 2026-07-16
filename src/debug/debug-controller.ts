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

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "d" && event.key !== "D") {
            return;
        }
        this.enabled = !this.enabled;
    };
}
