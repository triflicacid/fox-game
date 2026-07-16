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
     */
    public constructor(
        private readonly getCameraFollowMode: () => CameraFollowMode | undefined,
        private readonly setCameraFollowMode: (mode: CameraFollowMode) => void,
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
            {label: "Close", onClick: () => this.popup.close()},
        ]);
        this.popup.draw(ctx, canvasWidth, canvasHeight);
    }

    /**
     * Builds this popup's content: currently just the camera follow mode,
     * as a radio choice between {@link CameraFollowMode}'s two values.
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
        ];
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "#") {
            this.popup.show();
        }
    };
}
