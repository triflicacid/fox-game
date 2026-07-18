import {BoxKind, ChromeTheme} from "./chrome-theme";
import {COLORS} from "./colors";

/** Outer bevel edge colour (top/left), the lightest tone. */
const BORDER_HIGHLIGHT_COLOR = "#ffffff";
/** Inner bevel edge colour (top/left). */
const BORDER_LIGHT_COLOR = "#dfdfdf";
/** Inner bevel edge colour (bottom/right). */
const BORDER_SHADOW_COLOR = "#808080";
/** Outer bevel edge colour (bottom/right), the darkest tone. */
const BORDER_DARK_SHADOW_COLOR = "#000000";

/** Flat grey face colour shared by every Win98 surface (panel body, control faces). */
const SURFACE_COLOR = "#c0c0c0";

/**
 * Draws a two-tone bevel edge: `topLeft` along the top and left sides of the
 * `w`x`h` box at `x, y`, `bottomRight` along its bottom and right, each 1
 * canvas pixel thick.
 */
function drawBevelEdge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    topLeft: string,
    bottomRight: string,
): void {
    ctx.fillStyle = topLeft;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = bottomRight;
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
}

/** Draws a classic Windows 98 "raised" border, 2 canvas pixels thick, around the `w`x`h` box at `x, y`. */
function drawRaisedBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    drawBevelEdge(ctx, x, y, w, h, BORDER_HIGHLIGHT_COLOR, BORDER_DARK_SHADOW_COLOR);
    drawBevelEdge(ctx, x + 1, y + 1, w - 2, h - 2, BORDER_LIGHT_COLOR, BORDER_SHADOW_COLOR);
}

/** Draws a classic Windows 98 "sunken" box: a white fill with the bevel edges inverted relative to a raised border. */
function drawSunkenBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
    drawBevelEdge(ctx, x, y, w, h, BORDER_SHADOW_COLOR, BORDER_HIGHLIGHT_COLOR);
}

/**
 * The classic Windows 98 "raised panel, sunken control" look: bevelled
 * two-tone borders, grey control faces, a white sunken box for
 * checkboxes/number inputs/selects.
 */
class Win98Theme extends ChromeTheme {
    public constructor() {
        super(SURFACE_COLOR, "#000000", COLORS.navy, "#ffffff", 2);
    }

    public override drawPanelBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawRaisedBorder(ctx, x, y, w, h);
    }

    public override drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: BoxKind): void {
        if (kind === "sunken") {
            drawSunkenBox(ctx, x, y, w, h);
        } else {
            ctx.fillStyle = SURFACE_COLOR;
            ctx.fillRect(x, y, w, h);
            drawRaisedBorder(ctx, x, y, w, h);
        }
    }

    public override drawRadioMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, selected: boolean): void {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 0.5, Math.PI * 0.75, Math.PI * 1.75);
        ctx.strokeStyle = BORDER_SHADOW_COLOR;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius - 0.5, Math.PI * -0.25, Math.PI * 0.75);
        ctx.strokeStyle = BORDER_HIGHLIGHT_COLOR;
        ctx.stroke();

        if (selected) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = "#000000";
            ctx.fill();
        }
    }

    public override drawSelectArrowButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, open: boolean): void {
        ctx.fillStyle = SURFACE_COLOR;
        ctx.fillRect(x, y, w, h);
        if (open) {
            drawBevelEdge(ctx, x, y, w, h, BORDER_SHADOW_COLOR, BORDER_HIGHLIGHT_COLOR);
        } else {
            drawBevelEdge(ctx, x, y, w, h, BORDER_HIGHLIGHT_COLOR, BORDER_SHADOW_COLOR);
        }

        const cx = x + w / 2;
        const cy = y + h / 2;
        const triSize = Math.min(w, h) * 0.3;
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.moveTo(cx - triSize, cy - triSize * 0.5);
        ctx.lineTo(cx + triSize, cy - triSize * 0.5);
        ctx.lineTo(cx, cy + triSize * 0.6);
        ctx.closePath();
        ctx.fill();
    }
}

export const WIN98_THEME: ChromeTheme = new Win98Theme();
