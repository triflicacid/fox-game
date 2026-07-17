import {COLORS} from "./colors";

/**
 * Colours, fonts, and layout used by every {@link Popup}.
 */
export const POPUP_CONFIG = {
    /** Colour of the dimming layer drawn behind the popup. */
    dimColor: "rgba(0, 0, 0, 0.4)",
    /** Background colour of the popup itself. */
    backgroundColor: "#c0c0c0",

    /** Outer bevel edge colour (top/left), the lightest tone. */
    borderHighlightColor: "#ffffff",
    /** Inner bevel edge colour (top/left). */
    borderLightColor: "#dfdfdf",
    /** Inner bevel edge colour (bottom/right). */
    borderShadowColor: "#808080",
    /** Outer bevel edge colour (bottom/right), the darkest tone. */
    borderDarkShadowColor: "#000000",

    /** Text colour for the popup's title. */
    titleColor: "#000000",
    /** Font for the popup's title. */
    titleFont: "bold 16px monospace",
    /** Height reserved for the title above the lines of text, in canvas pixels. */
    titleHeight: 24,

    /** Default text colour for a line's segments and for buttons. */
    textColor: "#000000",
    /** Default font family for a line's segments and for buttons. */
    fontFamily: "monospace",
    /** Default font size for a line's segments and for buttons, in canvas pixels. */
    fontSize: 14,
    /** Minimum vertical spacing between lines of text (and the button row), in canvas pixels. */
    lineHeight: 20,

    /** Background colour drawn behind whichever button the cursor is on. */
    highlightBackgroundColor: COLORS.navy,
    /** Text colour for whichever button the cursor is on. */
    highlightTextColor: "#ffffff",
    /** Horizontal gap between buttons in the button row, in canvas pixels. */
    buttonGap: 16,
    /** Vertical gap between the last line of text and the button row, in canvas pixels. */
    buttonRowGap: 8,

    /** Diameter of a radio input's marker circle, in canvas pixels. */
    radioMarkerSize: 12,
    /** Gap between a radio option's marker and its label, in canvas pixels. */
    radioMarkerGap: 6,
    /** Horizontal gap between consecutive options within a radio input, in canvas pixels. */
    radioOptionGap: 16,

    /** Width/height of a checkbox input's box, in canvas pixels. */
    checkboxSize: 12,
    /** Gap between a checkbox's box and its label, in canvas pixels. */
    checkboxGap: 6,

    /** Width of a number input's box, in canvas pixels - fixed, regardless of the value's length. */
    numberInputWidth: 48,
    /** Horizontal padding inside a number input's box, in canvas pixels. */
    numberInputPadding: 4,
    /** Half-period of a number input's blinking edit cursor, in milliseconds - on for this long, then off for this long. */
    cursorBlinkIntervalMs: 500,

    /** Horizontal padding inside a select input's box and dropdown rows, in canvas pixels. */
    selectPadding: 4,
    /** Width of a select input's dropdown-arrow button, in canvas pixels. */
    selectArrowWidth: 18,

    /** Padding around the popup's content, in canvas pixels. */
    padding: 12,
} as const;
