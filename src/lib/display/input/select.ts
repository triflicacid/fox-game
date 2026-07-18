import {TextSegment} from "../text-style";
import {HighlightStyle, InputBase} from "./base";

/** A single selectable option within a {@link SelectInput}. */
export interface SelectOption {
    /** Uniquely identifies this option; passed to the owning {@link SelectInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Colours to highlight this option's row with while highlighted in the open dropdown. Defaults to the owning {@link SelectInput}'s `highlightStyle`, then the theme. */
    highlightStyle?: Partial<HighlightStyle>;
    /** Whether this option is disabled, independent of the owning {@link SelectInput}. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this option acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}

/**
 * A dropdown, themed per whichever {@link ChromeTheme} its owning display uses.
 */
export interface SelectInput extends InputBase {
    kind: "select";
    /** The options to choose between. */
    options: SelectOption[];
    /** `key` of the currently selected option. */
    selected: string;
    /** Invoked with an option's `key` when the user commits a selection. */
    onSelect: (key: string) => void;
}
