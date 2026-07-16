import {KeyBinding} from "./key-binding";
import {Popup} from "../popup/popup";
import {PopupLine, TextFormat} from "../popup/text-style";
import {COLORS} from "../popup/colors";
import {PopupSource} from "../popup/popup-source";

/** Title shown atop the help popup. */
const TITLE = "Keys";

/** Gap, in characters, between a key's label and its description. */
const KEY_DESCRIPTION_GAP = 2;

/**
 * Shows the game's key bindings in a {@link Popup}, opened with `?` and
 * closed with `Esc` or `?` again (or by selecting its `Close` button).
 */
export class HelpController implements PopupSource {
    private readonly popup = new Popup({closeKeys: ["Escape", "?"]});

    /**
     * @param getBindings - Called on every {@link draw} to fetch every key
     * binding currently in effect across the game, since this controller
     * doesn't own the other controllers that contribute them.
     */
    public constructor(private readonly getBindings: () => KeyBinding[]) {
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
            {key: "?", description: "Toggle the help window"},
            {key: "Esc", description: "Close this popup"},
        ];
    }

    /**
     * Draws the help popup, refreshing its content from {@link getBindings} first.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        this.popup.setContent(TITLE, this.formatLines(this.getBindings()), [
            {label: "Close", onClick: () => this.popup.close()},
        ]);
        this.popup.draw(ctx, canvasWidth, canvasHeight);
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
                {content: binding.key.padEnd(keyWidth), style: {foreground: COLORS.brightYellow, format: TextFormat.BOLD}},
                {content: binding.description},
        ]);
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "?") {
            this.popup.show();
        }
    };
}
