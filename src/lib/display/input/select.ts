import {TextSegment, TextStyle} from "../text-style";
import {InputBase} from "./base";

/** A single selectable option within a {@link SelectInput}. */
export interface SelectOption {
    /** Uniquely identifies this option; passed to the owning {@link SelectInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Style overlaid on this option's row while highlighted in the open dropdown. Falls back to the owning {@link SelectInput}'s `focusedStyle`, then the theme. */
    focusedStyle?: TextStyle;
    /** Style overlaid on this option's row while it is the selected one. Falls back to the owning {@link SelectInput}'s `selectedStyle`. */
    selectedStyle?: TextStyle;
    /** Whether this option is disabled, independent of the owning {@link SelectInput}. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this option acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}

/**
 * A dropdown, themed per whichever {@link ChromeTheme} its owning display uses.
 *
 * Colour precedence, resolved per field (foreground/background
 * independently): closed box - selected option's `selectedStyle` >
 * (`expandedStyle` while open, else `focusedStyle` while focused) > default;
 * open dropdown row - highlighted option's `focusedStyle` > selected
 * option's `selectedStyle` > `expandedStyle` (ambient) > default.
 */
export interface SelectInput extends InputBase {
    kind: "select";
    /** The options to choose between. */
    options: SelectOption[];
    /** `key` of the currently selected option. */
    selected: string;
    /** Style overlaid on the closed box while its dropdown is open. Falls back to `focusedStyle`. */
    expandedStyle?: TextStyle;
    /** Invoked with an option's `key` when the user commits a selection. */
    onSelect: (key: string) => void;
}
