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
    /** Colours to highlight this input with while focused. */
    highlightStyle?: Partial<HighlightStyle>;
    /** Whether this input is disabled. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this input acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}
