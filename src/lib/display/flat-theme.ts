import {ChromeTheme} from "./chrome-theme";
import {COLORS} from "./colors";
import {TextStyle} from "./text-style";

/** Background colour for every flat-themed surface (panel body, control faces). */
const SURFACE_COLOR = COLORS.black;
/** Border/outline colour drawn on top of {@link SURFACE_COLOR}. */
const BORDER_COLOR = COLORS.brightWhite;

/** Draws a single-pixel-thick rectangle outline around the `w`x`h` box at `x, y`. */
function drawOutline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/**
 * A flat, ANSI-terminal-style look: solid single-line borders, no bevels,
 * reverse video (swapped fore/background) for focus - the "sunken"/"raised"
 * distinction {@link ChromeTheme.drawBox} takes is a no-op here, since a
 * flat theme has no depth to show.
 */
class FlatTheme extends ChromeTheme {
    public constructor() {
        super(SURFACE_COLOR, BORDER_COLOR, 1);
    }

    public override defaultFocusedStyle(): TextStyle {
        return {background: BORDER_COLOR, foreground: SURFACE_COLOR};
    }

    public override drawPanelBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawOutline(ctx, x, y, w, h, BORDER_COLOR);
    }

    public override drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        ctx.fillStyle = SURFACE_COLOR;
        ctx.fillRect(x, y, w, h);
        drawOutline(ctx, x, y, w, h, BORDER_COLOR);
    }

    public override drawRadioMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, selected: boolean, foreground?: string, background?: string): void {
        if (background) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
            ctx.fillStyle = background;
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (selected) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = foreground ?? BORDER_COLOR;
            ctx.fill();
        }
    }

    public override drawSelectArrowButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, open: boolean): void {
        const background = open ? BORDER_COLOR : SURFACE_COLOR;
        const foreground = open ? SURFACE_COLOR : BORDER_COLOR;

        ctx.fillStyle = background;
        ctx.fillRect(x, y, w, h);
        drawOutline(ctx, x, y, w, h, BORDER_COLOR);

        const cx = x + w / 2;
        const cy = y + h / 2;
        const triSize = Math.min(w, h) * 0.3;
        ctx.fillStyle = foreground;
        ctx.beginPath();
        ctx.moveTo(cx - triSize, cy - triSize * 0.5);
        ctx.lineTo(cx + triSize, cy - triSize * 0.5);
        ctx.lineTo(cx, cy + triSize * 0.6);
        ctx.closePath();
        ctx.fill();
    }
}

export const FLAT_THEME: ChromeTheme = new FlatTheme();
