import {TextSegment} from "../text-style";
import {HighlightStyle, InputBase} from "./base";

/** A single selectable option within a {@link RadioInput}. */
export interface RadioOption {
    /** Uniquely identifies this option; passed to the owning {@link RadioInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Colours to highlight this option with while focused. Defaults to the owning {@link RadioInput}'s `highlightStyle`, then the theme. */
    highlightStyle?: Partial<HighlightStyle>;
    /** Whether this option is disabled, independent of the owning {@link RadioInput}. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this option acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}

/**
 * An interactive radio-button group. Exactly one option is selected at a time;
 * selecting another invokes `onSelect` with its `key`.
 */
export interface RadioInput extends InputBase {
    kind: "radio";
    /** The options to choose between. */
    options: RadioOption[];
    /** `key` of the currently selected option. */
    selected: string;
    /** Invoked with an option's `key` when the user selects it. */
    onSelect: (key: string) => void;
}
