/**
 * Bitwise text-formatting flags for {@link TextStyle.format}. Combine with
 * `|`, e.g. `TextFormat.BOLD | TextFormat.ITALIC`.
 */
export const TextFormat = {
    NONE: 0,
    BOLD: 1 << 0,
    ITALIC: 1 << 1,
    UNDERLINE: 1 << 2,
    UPPERCASE: 1 << 3,
    LOWERCASE: 1 << 4,
} as const;

/**
 * Visual style for a {@link TextSegment}. Any field left unset falls back to
 * whichever style is in effect where the segment appears - its parent
 * segment's style, or the popup's own defaults for a top-level segment.
 */
export interface TextStyle {
    /** Text colour, e.g. `"#ffffff"`. */
    foreground?: string;
    /** Background colour drawn behind the text, or unset for none. */
    background?: string;
    /** Font family, e.g. `"monospace"`. */
    fontFamily?: string;
    /** Font size, in canvas pixels. */
    fontSize?: number;
    /** Bitwise combination of {@link TextFormat} flags. */
    format?: number;
}

/**
 * A styled run of text or a nested list of further
 * segments, so a {@link PopupLine} can build up a tree of differently styled
 * runs.
 */
export interface TextSegment {
    /** Literal text, or nested child segments. */
    content: string | TextSegment[];
    /** Style for this segment; children inherit whichever fields they don't override. */
    style?: TextStyle;
}

/**
 * Background/foreground colours to highlight a focused element with.
 */
export interface HighlightStyle {
    background: string;
    foreground: string;
}

/**
 * Fields shared by every {@link Input} kind.
 */
export interface InputBase {
    kind: string;
    highlightStyle?: Partial<HighlightStyle>;
}

/** A single selectable option within a {@link RadioInput}. */
export interface RadioOption {
    /** Uniquely identifies this option; passed to the owning {@link RadioInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Background/foreground colours to highlight this option with while focused. Defaults to the owning {@link RadioInput}'s `highlightStyle`, then navy/white. */
    highlightStyle?: Partial<HighlightStyle>;
}

/**
 * An interactive radio-button group. Exactly one of `options`
 * is selected at a time; clicking a different one invokes `onSelect` with
 * that option's `key`.
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

/** A single selectable option within a {@link SelectInput}. */
export interface SelectOption {
    /** Uniquely identifies this option; passed to the owning {@link SelectInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
    /** Background/foreground colours to highlight this option's row with while highlighted in the open dropdown. Defaults to the owning {@link SelectInput}'s `highlightStyle`, then navy/white. */
    highlightStyle?: Partial<HighlightStyle>;
}

/**
 * A Windows-98-style dropdown.
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

/**
 * A single checkbox. Toggling it invokes `onToggle` with its new
 * checked state.
 */
export interface CheckboxInput extends InputBase {
    kind: "checkbox";
    /** Whether the checkbox is currently checked. */
    checked: boolean;
    /** Content shown as this checkbox's label. */
    content: TextSegment[];
    /** Invoked with the new checked state when the user toggles it. */
    onToggle: (checked: boolean) => void;
}

/**
 * A single numeric text field, combobox-like: while merely focused,
 * `ArrowUp`/`ArrowDown` move focus like any other input. `Enter`/`Space` (or
 * typing a digit) enters edit mode, showing a blinking bar cursor after the
 * typed digits; while editing, `ArrowUp`/`ArrowDown` step `value` instead,
 * `Enter`/`Space` commit the typed value and leave edit mode (still
 * focused), and `Esc` discards it and leaves edit mode, reverting to
 * `value`. Focus moving away (e.g. `ArrowLeft`/`ArrowRight`, or closing the
 * popup) also commits any in-progress edit.
 */
export interface NumberInput extends InputBase {
    kind: "number";
    /** Current value. */
    value: number;
    /** Amount `ArrowUp`/`ArrowDown` change `value` by while editing. Defaults to `1`. */
    step?: number;
    /** Whether typing a decimal point is allowed. Defaults to `false` (integers only). */
    allowDecimal?: boolean;
    /** Invoked with the new value once an edit commits (`Enter`/`Space`, focus moving away, or an `ArrowUp`/`ArrowDown` step while editing). */
    onChange: (value: number) => void;
}

/**
 * A button input, clickable via Enter/Space.
 */
export interface ButtonInput extends InputBase {
    kind: "button";
    /** Text shown for the button, wrapped in `[...]` when drawn. */
    label: string;
    /** Invoked when the button is activated. */
    onClick: () => void;
}

/**
 * Every kind of interactive input a {@link PopupLine} can embed alongside
 * plain text. Add further input kinds to this union as they're introduced,
 * each with its own `kind` literal.
 */
export type Input = RadioInput | CheckboxInput | NumberInput | ButtonInput | SelectInput;

/** A single item within a {@link PopupLine}: styled text, or an interactive input. */
export type PopupLineItem = TextSegment | Input;

/** A single line in a {@link Popup}, made of one or more top-level items. */
export type PopupLine = PopupLineItem[];
