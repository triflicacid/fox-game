import {TextStyle} from "./text-style";
import {ResolvedStateStyle} from "./state-style";

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
     * @param boxBackground - Default fill colour of a sunken box/marker face (e.g. a checkbox's or radio marker's default interior), before any state-style override.
     * @param borderWidth - Thickness of {@link drawPanelBorder}'s border, in canvas pixels - callers use this to inflate the rect they draw the border around.
     */
    protected constructor(
        public readonly surfaceBackground: string,
        public readonly boxForeground: string,
        public readonly boxBackground: string,
        public readonly borderWidth: number,
    ) {
    }

    /** This theme's default style for a focused element. */
    public abstract defaultFocusedStyle(): TextStyle;

    /** Draws a panel's outer border/frame around the `w`x`h` box at `x, y`, if this theme has one at all. */
    public abstract drawPanelBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;

    /** Draws a box's chrome (e.g. a checkbox/number-input/select box) for the `w`x`h` box at `x, y`. */
    public abstract drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: BoxKind): void;

    /** Box size needed to fit `contentWidth`x`contentHeight` content without clipping it against this theme's own chrome. Symmetric per axis. */
    public abstract boxDimensionsFor(contentWidth: number, contentHeight: number): {w: number; h: number};

    /** Draws a radio marker at `(cx, cy)` with the given `radius`, filled in when `selected`. `foreground`/`background` override the dot/face colour when given. */
    public abstract drawRadioMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, selected: boolean, foreground?: string, background?: string): void;

    /** Draws a select input's dropdown-arrow button for the `w`x`h` box at `x, y`, shown pressed while `open`. */
    public abstract drawSelectArrowButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, open: boolean): void;

    /** Draws a button's face for the `w`x`h` box at `x, y` - raised at rest, sunken while `pressed`, same face colour either way. */
    public abstract drawButtonBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pressed: boolean): void;

    /** Draws a themed line from `(x1, y1)` to `(x2, y2)`, `thickness` canvas pixels wide - a flat stroke, or (for horizontal/vertical lines) a bevelled groove, per theme. Used for an {@link HrInput} today; general-purpose for any future straight-line chrome. */
    public abstract drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, thickness: number): void;

    /** Draws a button's focus indicator over its box - default fills `style.background` inset by `borderWidth`, overridable. */
    public drawButtonFocus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: ResolvedStateStyle): void {
        if (style.background === undefined) {
            return;
        }
        const inset = this.borderWidth;
        ctx.fillStyle = style.background;
        ctx.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    }
}
