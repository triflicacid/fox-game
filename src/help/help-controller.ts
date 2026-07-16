import {KeyBinding} from "./key-binding";
import {Popup} from "../popup/popup";
import {drawPopup} from "../popup/popup-renderer";
import {PopupLine, TextFormat, TextSegment} from "../popup/text-style";

/** Title shown atop the help popup. */
const TITLE = "Keys";

/** Gap, in characters, between a key's label and its description. */
const KEY_DESCRIPTION_GAP = 2;

/**
 * Shows the game's key bindings in a {@link Popup}, opened with `?` and
 * closed with `Esc` or `?` again (or by selecting its `Close` button).
 */
export class HelpController {
    private readonly popup = new Popup({closeKeys: ["Escape", "?"]});

    public constructor() {
        window.addEventListener("keydown", this.handleKeyDown);
    }

    /**
     * Whether the help popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    public isOpen(): boolean {
        return this.popup.isOpen();
    }

    /**
     * This controller's own key bindings, for the help popup itself to list.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        return [
            {key: "?", description: "Toggle this help window"},
            {key: "Esc", description: "Close this help window"},
        ];
    }

    /**
     * Draws the help popup, refreshing its content from `bindings` first.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     * @param bindings - Every key binding currently in effect, to list.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, bindings: KeyBinding[]): void {
        this.popup.setContent(TITLE, this.formatLines(bindings), [
            {label: "Close", onClick: () => this.popup.close()},
        ]);
        drawPopup(ctx, canvasWidth, canvasHeight, this.popup);
    }

    /**
     * Formats `bindings`, sorted alphabetically by key, into aligned
     * `"key  description"` lines.
     *
     * @param bindings - Key bindings to format.
     * @returns One formatted line per binding.
     */
    private formatLines(bindings: KeyBinding[]): PopupLine[] {
        const sorted = [...bindings].sort((a, b) => a.key.localeCompare(b.key));
        const keyWidth = Math.max(...sorted.map((binding) => binding.key.length)) + KEY_DESCRIPTION_GAP;
        return sorted.map((binding) => [
                {content: binding.key.padEnd(keyWidth), style: {foreground: '#ffea00', format: TextFormat.BOLD}},
                {content: binding.description},
        ]);
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "?") {
            this.popup.show();
        }
    };
}
