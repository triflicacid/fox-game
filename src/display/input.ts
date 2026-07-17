import {TextSegment} from "./text-style";

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
    /** Background/foreground colours to highlight this option with while focused. Defaults to the owning {@link RadioInput}'s `highlightStyle`, then the display's theme. */
    highlightStyle?: Partial<HighlightStyle>;
}

/**
 * An interactive radio-button group. Exactly one of `options`
 * is selected at a time. Clicking a different one invokes `onSelect` with
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
    /** Background/foreground colours to highlight this option's row with while highlighted in the open dropdown. Defaults to the owning {@link SelectInput}'s `highlightStyle`, then the display's theme. */
    highlightStyle?: Partial<HighlightStyle>;
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
 * A single numeric text field. Must be focused to be edited.
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
 * Every kind of interactive input an {@link InteractableDisplay} can embed
 * alongside plain text. Add further input kinds to this union as they're
 * introduced, each with its own `kind` literal.
 */
export type Input = RadioInput | CheckboxInput | NumberInput | ButtonInput | SelectInput;

/** A single item within a {@link DisplayLine}: styled text, or an interactive input. */
export type DisplayLineItem = TextSegment | Input;

/** A single line an {@link InteractableDisplay} can lay out, made of one or more top-level items. */
export type DisplayLine = DisplayLineItem[];
