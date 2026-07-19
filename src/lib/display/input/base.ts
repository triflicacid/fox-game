import {Alignment, TextStyle} from "../text-style";
import {Spacing} from "../spacing";

/**
 * Fields shared by every top-level {@link DisplayLine}.
 */
export interface ElementBase {
    kind: string;
    /** This element's style at rest. Consulted only as `inputStyle`'s fallback on checkbox/radio, or (`foreground` only) as an {@link HrInput}'s line colour - see each kind for specifics. */
    style?: TextStyle;
    /** If `true`, this element acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
    /** Vertical alignment within the line. Defaults to `"top"`. */
    align?: Alignment;
    /** Space inside this element's own box, between its content and its clickable/focusable bounds. Defaults to `0`. */
    padding?: Spacing;
    /** Space outside this element's own box, pushing neighbouring elements/lines away. Defaults to `0`. */
    margin?: Spacing;
}

/**
 * Fields shared by every focusable {@link Input} kind.
 */
export interface InputBase extends ElementBase {
    /** Style overlaid on this input while it is focused. Falls back to the theme's default focused style. */
    focusedStyle?: TextStyle;
    /** Style overlaid on this input while it is selected/checked, or - for a textbox/number - the style of its text selection. */
    selectedStyle?: TextStyle;
    /** Whether this input is disabled. Defaults to `false`. */
    disabled?: boolean;
}
