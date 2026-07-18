import {TextStyle} from "./text-style";

/** A box's depth appearance. */
export type BoxKind = "sunken" | "raised";

/**
 * Visual chrome an {@link InteractableDisplay} draws around/inside its
 * input elements and panel.
 */
export abstract class ChromeTheme {
    /**
     * @param surfaceBackground - Flat surface colour for a panel's body and for a control's idle face (e.g. the select arrow button).
     * @param boxForeground - Text/mark colour that reads clearly against {@link drawBox}'s fill (e.g. a checkbox's tick, a number input's digits).
     * @param borderWidth - Thickness of {@link drawPanelBorder}'s border, in canvas pixels - callers use this to inflate the rect they draw the border around.
     */
    protected constructor(
        public readonly surfaceBackground: string,
        public readonly boxForeground: string,
        public readonly borderWidth: number,
    ) {
    }

    /** This theme's default style for a focused element. */
    public abstract defaultFocusedStyle(): TextStyle;

    /** Draws a panel's outer border/frame around the `w`x`h` box at `x, y`, if this theme has one at all. */
    public abstract drawPanelBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;

    /** Draws a box's chrome (e.g. a checkbox/number-input/select box) for the `w`x`h` box at `x, y`. */
    public abstract drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: BoxKind): void;

    /** Draws a radio marker at `(cx, cy)` with the given `radius`, filled in when `selected`. `foreground`/`background` override the dot/face colour when given. */
    public abstract drawRadioMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, selected: boolean, foreground?: string, background?: string): void;

    /** Draws a select input's dropdown-arrow button for the `w`x`h` box at `x, y`, shown pressed while `open`. */
    public abstract drawSelectArrowButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, open: boolean): void;
}
