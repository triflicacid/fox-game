import {HighlightStyle, InputBase} from "./base";

/**
 * Fields shared by {@link NumberInput} and {@link TextInput} - both render as a
 * single-line sunken box sized to their content.
 */
export interface TextBoxInputBase extends InputBase {
    /** Fixed width of the box, in canvas pixels; longer content clips and scrolls while editing. `Infinity` sizes the box to fit its content instead (bounded below by `minWidth`). Defaults to the display's default box width. */
    maxWidth?: number;
    /** Minimum width the box may shrink to, in canvas pixels; only relevant when `maxWidth` is `Infinity`. Defaults to `0`. */
    minWidth?: number;
    /** Colours for the Shift+Arrow text selection. Unset fields fall back to `highlightStyle`. */
    selectionStyle?: Partial<HighlightStyle>;
}

/**
 * A single numeric text field. Must be focused to be edited.
 */
export interface NumberInput extends TextBoxInputBase {
    kind: "number";
    /** Current value. */
    value: number;
    /** Amount `ArrowUp`/`ArrowDown` change `value` by while editing. Defaults to `1`. */
    step?: number;
    /** Whether typing a decimal point is allowed. Defaults to `false` (integers only). */
    allowDecimal?: boolean;
    /** Invoked with the new value once an edit commits. */
    onChange: (value: number) => void;
}

/**
 * A single generic text field. Must be focused to be edited. Allows arbitrary
 * text and has no `ArrowUp`/`ArrowDown` stepping.
 */
export interface TextInput extends TextBoxInputBase {
    kind: "textbox";
    /** Current value. */
    value: string;
    /** If set, only these characters may be typed. Mutually exclusive with `disallowedChars`, which is ignored if both are set. */
    allowedChars?: string[];
    /** If set, these characters may not be typed. Ignored if `allowedChars` is also set. */
    disallowedChars?: string[];
    /** Invoked with the new value once an edit commits. Return `true` to accept, or `false` to reject and revert to the previous `value`. */
    onChange: (value: string) => boolean;
}
