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
 * Concrete {@link ChromeTheme} implementation for a flat, terminal-like look.
 *
 * Borders are single-pixel outlines and focus is shown via reverse video.
 * Depth hints like "raised" vs "sunken" intentionally collapse into the same
 * treatment.
 */
class FlatTheme extends ChromeTheme {
    public constructor() {
        super(SURFACE_COLOR, BORDER_COLOR, SURFACE_COLOR, 1);
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

    public override boxDimensionsFor(contentWidth: number, contentHeight: number): {w: number; h: number} {
        // +2 clears drawOutline's own 1px stroke on each side.
        return {w: contentWidth + 2, h: contentHeight + 2};
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

    public override drawButtonBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pressed: boolean): void {
        ctx.fillStyle = SURFACE_COLOR;
        ctx.fillRect(x, y, w, h);
        drawOutline(ctx, x, y, w, h, BORDER_COLOR);
        if (pressed) {
            drawOutline(ctx, x + 2, y + 2, w - 4, h - 4, BORDER_COLOR);
        }
    }

    public override drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, thickness: number): void {
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
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

/**
 * Shared singleton instance of the flat theme.
 *
 * Use this when you want minimal, non-bevelled chrome with clear high-contrast
 * outlines.
 */
export const FLAT_THEME: ChromeTheme = new FlatTheme();
