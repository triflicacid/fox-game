import {Alignment, TextSegment, TextStyle} from "../text-style";
import {InputBase} from "./base";

/** A single selectable option within a {@link RadioInput}. */
export interface RadioOption {
    /** Uniquely identifies this option; passed to the owning {@link RadioInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Vertical alignment within the radio's own bounding box, independent of other options. Defaults to `"top"`. */
    align?: Alignment;
    /** Style overlaid on this option while focused. Falls back to the owning {@link RadioInput}'s `focusedStyle`, then the theme. */
    focusedStyle?: TextStyle;
    /** Style overlaid on this option while it is the selected one. Falls back to the owning {@link RadioInput}'s `selectedStyle`. */
    selectedStyle?: TextStyle;
    /** Style colouring just this option's marker while selected. Falls back to the owning {@link RadioInput}'s `inputSelectedStyle`, then this option's `selectedStyle`, then the theme's default marker look. */
    inputSelectedStyle?: TextStyle;
    /** Style colouring just this option's marker at rest (unselected, unfocused). Falls back to the owning {@link RadioInput}'s `inputStyle`, then its `style`, then the theme's default marker look. */
    inputStyle?: TextStyle;
    /** Whether this option is disabled, independent of the owning {@link RadioInput}. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this option acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
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
