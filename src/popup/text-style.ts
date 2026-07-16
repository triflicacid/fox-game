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

/** A single selectable option within a {@link RadioInput}. */
export interface RadioOption {
    /** Uniquely identifies this option; passed to the owning {@link RadioInput}'s `onSelect`. */
    key: string;
    /** Content shown as this option's label. */
    content: TextSegment[];
}

/**
 * An interactive radio-button group, usable as an item within a {@link
 * PopupLine} alongside plain {@link TextSegment}s. Exactly one of `options`
 * is selected at a time; clicking a different one invokes `onSelect` with
 * that option's `key`.
 */
export interface RadioInput {
    kind: "radio";
    /** The options to choose between. */
    options: RadioOption[];
    /** `key` of the currently selected option. */
    selected: string;
    /** Invoked with an option's `key` when the user selects it. */
    onSelect: (key: string) => void;
}

/**
 * A single checkbox, usable as an item within a {@link PopupLine} alongside
 * plain {@link TextSegment}s. Toggling it invokes `onToggle` with its new
 * checked state.
 */
export interface CheckboxInput {
    kind: "checkbox";
    /** Whether the checkbox is currently checked. */
    checked: boolean;
    /** Content shown as this checkbox's label. */
    content: TextSegment[];
    /** Invoked with the new checked state when the user toggles it. */
    onToggle: (checked: boolean) => void;
}

/**
 * Every kind of interactive input a {@link PopupLine} can embed alongside
 * plain text. Add further input kinds to this union as they're introduced,
 * each with its own `kind` literal.
 */
export type Input = RadioInput | CheckboxInput;

/** A single item within a {@link PopupLine}: styled text, or an interactive input. */
export type PopupLineItem = TextSegment | Input;

/** A single line in a {@link Popup}, made of one or more top-level items. */
export type PopupLine = PopupLineItem[];
