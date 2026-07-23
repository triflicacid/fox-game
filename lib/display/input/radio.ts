import {TextSegment, TextStyle} from "../text-style";
import {InputBase} from "./base";

/** A single selectable option within a {@link RadioInput} - shares every {@link InputBase} field, resolved against the owning input as a fallback. */
export interface RadioOption extends Omit<InputBase, "kind"> {
    /** Uniquely identifies this option; passed to the owning {@link RadioInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. Unset for no label. */
    content?: string | TextSegment[];
    /** Style colouring just this option's marker while selected. Falls back to the owning {@link RadioInput}'s `inputSelectedStyle`, then this option's `selectedStyle`, then the theme's default marker look. */
    inputSelectedStyle?: TextStyle;
    /** Style colouring just this option's marker at rest (unselected, unfocused). Falls back to the owning {@link RadioInput}'s `inputStyle`, then `style` (this option's own, then the input's), then the theme's default marker look. */
    inputStyle?: TextStyle;
}

/**
 * An interactive radio-button group. Exactly one option is selected at a time;
 * selecting another invokes `onSelect` with its `key`.
 *
 * Colour precedence, resolved per field (foreground/background
 * independently) and per option: label and its background rect -
 * `focusedStyle` while focused > `selectedStyle` while selected > default.
 * The marker is unaffected by focus: `inputSelectedStyle` (falls back to
 * `selectedStyle`, then the theme's default marker look) while selected >
 * `inputStyle` (falls back to `style`, then the theme's default marker
 * look) at rest. That default is always concrete, so `invert` on either
 * always has a colour pair to swap even with nothing else set.
 */
export interface RadioInput extends InputBase {
    kind: "radio";
    /** The options to choose between. */
    options: RadioOption[];
    /** `key` of the currently selected option. */
    selected: string;
    /** Style colouring the selected option's marker. Falls back to `selectedStyle`, then the theme's default marker look. */
    inputSelectedStyle?: TextStyle;
    /** Style colouring an unselected, unfocused option's marker. Falls back to `style`, then the theme's default marker look. */
    inputStyle?: TextStyle;
    /** Invoked with an option's `key` when the user selects it. */
    onSelect: (key: string) => void;
}
