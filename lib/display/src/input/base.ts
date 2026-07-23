import {Alignment, TextStyle} from "../text-style";
import {Spacing} from "../spacing";

/**
 * Fields shared by every top-level {@link DisplayLine}.
 */
export interface ElementBase {
    /** Discriminant tag used by the `Input` union and render/event dispatch to identify the concrete element kind. */
    kind: string;
    /** This element's style at rest. Consulted only as `inputStyle`'s fallback on checkbox/radio, or on an {@link HrInput} - `foreground`, if set, overrides the theme's own line rendering with a flat fill; `background` fills its content+padding rect - see each kind for specifics. */
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
    /** Style overlaid on this input while it is selected/checked, or - for a textbox/number - the style of its text selection. When both focused and selected apply, each input kind defines precedence explicitly (for example, radio/select document this in their own interfaces). */
    selectedStyle?: TextStyle;
    /** Whether this input is disabled. Defaults to `false`. */
    disabled?: boolean;
}
