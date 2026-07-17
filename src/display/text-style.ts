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
}

/**
 * A styled run of text or a nested list of further segments.
 */
export interface TextSegment {
    /** Literal text, or nested child segments. */
    content: string | TextSegment[];
    /** Style for this segment; children inherit whichever fields they don't override. */
    style?: TextStyle;
}
