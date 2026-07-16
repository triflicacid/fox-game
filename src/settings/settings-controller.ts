import {Popup} from "../popup/popup";
import {PopupLine} from "../popup/text-style";
import {KeyBinding} from "../help/key-binding";
import {PopupSource} from "../popup/popup-source";
import {CameraFollowMode} from "../entities/movement-controller";

/** Title shown atop the settings popup. */
const TITLE = "Settings";

/**
 * Shows the game's settings in a {@link Popup}, opened with `#` and closed
 * with `Esc` or `#` again (or by selecting its `Close` button).
 */
export class SettingsController implements PopupSource {
    private readonly popup = new Popup({closeKeys: ["Escape", "#"]});

    /**
     * @param getCameraFollowMode - Called on every {@link draw} to read the current camera follow mode.
     * @param setCameraFollowMode - Invoked when the user selects a different camera follow mode.
     * @param getSpectating - Called on every {@link draw} to read whether spectator mode is on.
     * @param setSpectating - Invoked when the user toggles the spectator mode checkbox.
     * @param getDebugEnabled - Called on every {@link draw} to read whether debug mode is on.
     * @param setDebugEnabled - Invoked when the user toggles the debug mode checkbox.
     * @param getTargetFps - Called on every {@link draw} to read the current target FPS.
     * @param setTargetFps - Invoked when the user edits the target FPS field.
     */
    public constructor(
        private readonly getCameraFollowMode: () => CameraFollowMode | undefined,
        private readonly setCameraFollowMode: (mode: CameraFollowMode) => void,
        private readonly getSpectating: () => boolean,
        private readonly setSpectating: (spectating: boolean) => void,
        private readonly getDebugEnabled: () => boolean,
        private readonly setDebugEnabled: (enabled: boolean) => void,
        private readonly getTargetFps: () => number,
        private readonly setTargetFps: (fps: number) => void,
    ) {
        window.addEventListener("keydown", this.handleKeyDown);
    }

    /**
     * Whether the settings popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    public isOpen(): boolean {
        return this.popup.isOpen();
    }

    /**
     * This controller's own key bindings, for the help popup to list.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        return [
            {key: "#", description: "Toggle the settings window"},
            {key: "Esc", description: "Close this popup"},
        ];
    }

    /**
     * Draws the settings popup, refreshing its content from {@link getCameraFollowMode} first.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        this.popup.setContent(TITLE, this.buildContent(), [
            {kind: "button", label: "Close", onClick: () => this.popup.close()},
        ]);
        this.popup.draw(ctx, canvasWidth, canvasHeight);
    }

    /**
     * Builds this popup's content: the camera follow mode as a radio choice
     * between {@link CameraFollowMode}'s two values, a checkbox each for
     * spectator mode and debug mode, and a number field for the target FPS.
     *
     * @returns The lines to show in the settings popup.
     */
    private buildContent(): PopupLine[] {
        return [
            [
                {content: "Camera follow mode: "},
                {
                    kind: "radio",
                    selected: this.getCameraFollowMode() ?? "",
                    onSelect: (key) => this.setCameraFollowMode(key as CameraFollowMode),
                    options: [
                        {key: "edge", content: [{content: "Edge"}]},
                        {key: "center", content: [{content: "Centre"}]},
                    ],
                },
            ],
            [
                {kind: "checkbox", checked: this.getSpectating(), onToggle: this.setSpectating, content: [{content: "Spectator mode"}]},
            ],
            [
                {kind: "checkbox", checked: this.getDebugEnabled(), onToggle: this.setDebugEnabled, content: [{content: "Debug mode"}]},
            ],
            [
                {content: "Target FPS: "},
                {kind: "number", value: this.getTargetFps(), step: 1, onChange: this.setTargetFps},
            ],
        ];
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "#") {
            this.popup.show();
        }
    };
}
