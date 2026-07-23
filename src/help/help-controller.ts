import {KeyBinding} from "./key-binding";
import {DisplayLine} from "@display/input";
import {TextFormat} from "@display/text-style";
import {COLORS} from "@display/colors";
import {KeyBindingPopupController} from "../popup/key-binding-popup-controller";

/** Gap, in characters, between a key's label and its description. */
const KEY_DESCRIPTION_GAP = 2;

/**
 * Shows the game's key bindings in a {@link Popup}, opened with `?` and
 * closed with `Esc` or `?` again (or by selecting its `Close` button).
 */
export class HelpController extends KeyBindingPopupController {
    /**
     * @param getBindings - Called on every {@link draw} to fetch every key
     * binding currently in effect across the game, since this controller
     * doesn't own the other controllers that contribute them.
     * @param onOpenChange - Called whenever this popup opens or closes.
     */
    public constructor(private readonly getBindings: () => KeyBinding[], onOpenChange: (open: boolean) => void) {
        super("Keyboard Controls", "?", {closeKeys: ["Escape", "?"], onOpenChange});
    }

    /**
     * This controller's own key bindings, for the help popup itself to list.
     *
     * @returns This controller's key bindings.
     */
    public override getKeyBindings(): KeyBinding[] {
        return [
            {key: "?", description: "Toggle the help window"},
            {key: "Esc", description: "Close this popup"},
        ];
    }

    /**
     * Builds this popup's content, formatting {@link getBindings} into
     * aligned lines.
     *
     * @returns The lines to show in the help popup.
     */
    protected buildContent(): DisplayLine[] {
        return this.formatLines(this.getBindings());
    }

    /**
     * Formats `bindings`, sorted alphabetically by key, into aligned
     * `"key  description"` lines.
     *
     * @param bindings - Key bindings to format.
     * @returns One formatted line per binding.
     */
    private formatLines(bindings: KeyBinding[]): DisplayLine[] {
        const sorted = [...bindings].sort((a, b) => a.key.localeCompare(b.key));
        const keyWidth = Math.max(...sorted.map((binding) => binding.key.length)) + KEY_DESCRIPTION_GAP;
        return sorted.map((binding) => [
                {content: binding.key.padEnd(keyWidth), style: {foreground: COLORS.brightYellow, format: TextFormat.BOLD}},
                {content: binding.description},
        ]);
    }
}
