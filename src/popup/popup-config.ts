/**
 * Colours, fonts, and layout used by every {@link Popup}.
 */
export const POPUP_CONFIG = {
    /** Colour of the dimming layer drawn behind the popup. */
    dimColor: "rgba(0, 0, 0, 0.4)",
    /** Background colour of the popup itself. */
    backgroundColor: "rgba(90, 90, 90, 0.95)",

    /** Text colour for the popup's title. */
    titleColor: "#ffffff",
    /** Font for the popup's title. */
    titleFont: "bold 16px monospace",
    /** Height reserved for the title above the lines of text, in canvas pixels. */
    titleHeight: 24,

    /** Default text colour for a line's segments and for buttons. */
    textColor: "#ffffff",
    /** Default font family for a line's segments and for buttons. */
    fontFamily: "monospace",
    /** Default font size for a line's segments and for buttons, in canvas pixels. */
    fontSize: 14,
    /** Minimum vertical spacing between lines of text (and the button row), in canvas pixels. */
    lineHeight: 20,

    /** Background colour drawn behind whichever button the cursor is on. */
    highlightBackgroundColor: "#1a3d7c",
    /** Horizontal gap between buttons in the button row, in canvas pixels. */
    buttonGap: 16,
    /** Vertical gap between the last line of text and the button row, in canvas pixels. */
    buttonRowGap: 8,

    /** Padding around the popup's content, in canvas pixels. */
    padding: 12,
} as const;
