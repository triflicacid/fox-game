import {TextStyle} from "../text-style";

/**
 * Fields shared by every {@link Input} kind.
 */
export interface InputBase {
    kind: string;
    /** This input's style at rest (no focus/selection/checked state). Currently consulted only as `inputStyle`'s fallback on checkbox/radio. */
    style?: TextStyle;
    /** Style overlaid on this input while it is focused. Falls back to the theme's default focused style. */
    focusedStyle?: TextStyle;
    /** Style overlaid on this input while it is selected/checked, or - for a textbox/number - the style of its text selection. */
    selectedStyle?: TextStyle;
    /** Whether this input is disabled. Defaults to `false`. */
    disabled?: boolean;
    /** If `true`, this input acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}
