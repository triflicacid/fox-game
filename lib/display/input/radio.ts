import {TextSegment, TextStyle} from "../text-style";
import {InputBase} from "./base";

/**
 * A single selectable option within a {@link RadioInput}.
 *
 * Inherited {@link InputBase} fields are interpreted per option: `style`,
 * `focusedStyle`, and `selectedStyle` colour this option's label/background;
 * behavioural flags such as `hidden` and `disabled` gate whether the option
 * participates in focus/selection; layout fields (for example `padding`) apply
 * to this option's row box before falling back to the owning input.
 *
 * `kind` is intentionally omitted because options are data inside one parent
 * `kind: "radio"` input, not standalone input elements.
 */
export interface RadioOption extends Omit<InputBase, "kind"> {
    /** Uniquely identifies this option within its owning `options` array; passed to the owning {@link RadioInput}'s `onSelect`. */
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
 * Colour precedence is resolved per field (foreground/background
 * independently) and per option: the label and its background rect use
 * `focusedStyle` while focused, otherwise `selectedStyle` while selected,
 * then default.
 *
 * The marker is unaffected by focus: while selected, `inputSelectedStyle`
 * falls back to `selectedStyle`, then the theme's default marker look;
 * at rest, `inputStyle` falls back to `style`, then the theme's default
 * marker look. That default is always concrete, so `invert` on either
 * style always has a colour pair to swap even when nothing else is set.
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
