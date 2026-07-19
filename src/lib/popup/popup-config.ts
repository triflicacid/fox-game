/**
 * Fonts and layout used by every {@link Popup}. Colours belonging to its
 * chrome (panel background/border, control faces, focus highlight) live in
 * whichever {@link ChromeTheme} it's built with instead - see
 * {@link WIN98_THEME}.
 */
export const POPUP_CONFIG = {
    /** Colour of the dimming layer drawn behind the popup. */
    dimColor: "rgba(0, 0, 0, 0.4)",

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
    /** Vertical gap placed between consecutive lines of text (and before the button row), in canvas pixels. */
    lineSpacing: 20,

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

    /** Padding, in canvas pixels, added around a number/textbox's sunken box when drawing its `focusedStyle` background. */
    focusHighlightPadding: 2,

    /** Horizontal padding inside a button's box around its label, in canvas pixels. */
    buttonPaddingX: 8,
    /** Vertical padding inside a button's box around its label, in canvas pixels. */
    buttonPaddingY: 4,
    /** How far a button's label shifts right/down while pressed, in canvas pixels. */
    buttonPressedTextOffset: 1,

    /** Fill colour of the sheen painted over a disabled input, e.g. a translucent grey. */
    disabledOverlayColor: "rgba(128, 128, 128, 0.5)",

    /** Padding around the popup's content, in canvas pixels. */
    padding: 12,
} as const;
