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
 * segment's style, or a {@link Display}'s own defaults for a top-level
 * segment.
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
    /** If `true`, swaps this style's resolved `foreground`/`background`, applied to its own text and inherited (already swapped) by child segments. A no-op if `background` is unset - there's nothing to swap into `foreground`. */
    invert?: boolean;
    /** Bitwise {@link TextFormat} flags to clear from this style's resolved `format`, applied to its own text and inherited (already cleared) by child segments. Only clears bits - e.g. `invertFormat: TextFormat.BOLD` un-bolds within an inherited bold context, but can't itself add bold. */
    invertFormat?: number;
    /** Adjusts this style's resolved `fontSize`, applied to its own text and inherited (already adjusted) by child segments. A number is added (e.g. `-2` shrinks text relative to an inherited size); a function is called with the resolved size and returns the new one. */
    fontSizeDelta?: number | ((size: number) => number);
}

import {Spacing} from "./spacing";

/** Where an item sits, y-axis wise, within its line's height when that's taller than the item's own. */
export type Alignment = "top" | "centre" | "bottom";

/**
 * A styled run of text or a nested list of further segments.
 *
 * `align`, `interactive`, `onClick`, `focusedStyle`, `disabled`, `padding`,
 * and `margin` are only meaningful on a top-level `DisplayLine` item, not a
 * nested child segment.
 */
export interface TextSegment {
    /** Literal text, or nested child segments. */
    content: string | TextSegment[];
    /** Style for this segment; children inherit whichever fields they don't override. */
    style?: TextStyle;
    /** If `true`, this segment (and any children) acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
    /** Vertical alignment within the line. Defaults to `"top"`. */
    align?: Alignment;
    /** Makes this segment focusable and clickable, like an `Input`, but with no box/marker of its own. Defaults to `false`. */
    interactive?: boolean;
    /** Invoked when this segment is activated (click, or Enter/Space while focused). */
    onClick?: () => void;
    /** Style overlaid while this segment is focused, or briefly pressed. Falls back to the theme's default focused style. */
    focusedStyle?: TextStyle;
    /** Whether this segment is disabled - skips focus/click. Defaults to `false`. */
    disabled?: boolean;
    /** Space inside this segment's own box, between its content and its clickable/focusable bounds. Defaults to `0`. */
    padding?: Spacing;
    /** Space outside this segment's own box, pushing neighbouring elements/lines away. Defaults to `0`. */
    margin?: Spacing;
}
