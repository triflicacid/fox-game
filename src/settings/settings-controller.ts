import {Popup} from "../popup/popup";
import {PopupLine, TextFormat} from "../popup/text-style";
import {COLORS} from "../popup/colors";
import {KeyBinding} from "../help/key-binding";
import {PopupSource} from "../popup/popup-source";

/** Title shown atop the settings popup. */
const TITLE = "Settings";

/** Placeholder content shown until the settings popup has real settings. */
const CONTENT: PopupLine[] = [
    [{content: "empty for now :3", style: {foreground: COLORS.brightMagenta, format: TextFormat.ITALIC}}],
];

/**
 * Shows the game's settings in a {@link Popup}, opened with `#` and closed
 * with `Esc` or `#` again (or by selecting its `Close` button).
 */
export class SettingsController implements PopupSource {
    private readonly popup = new Popup({closeKeys: ["Escape", "#"]});

    public constructor() {
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
     * Draws the settings popup.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        this.popup.setContent(TITLE, CONTENT, [
            {label: "Close", onClick: () => this.popup.close()},
        ]);
        this.popup.draw(ctx, canvasWidth, canvasHeight);
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "#") {
            this.popup.show();
        }
    };
}
