import {Popup} from "./popup";
import {POPUP_CONFIG} from "./popup-config";
import {PopupLine, TextFormat, TextSegment, TextStyle} from "./text-style";
import {Rect} from "../geometry/rect";

/** A {@link TextStyle} with every field resolved to a concrete value. */
interface ResolvedStyle {
    foreground: string;
    background: string | undefined;
    fontFamily: string;
    fontSize: number;
    format: number;
}

/** A single flattened, styled run of text - the leaves of a {@link PopupLine}'s segment tree. */
interface ResolvedRun {
    text: string;
    foreground: string;
    background: string | undefined;
    font: string;
    fontSize: number;
    underline: boolean;
}

/** Style a top-level segment falls back to, built from {@link POPUP_CONFIG}. */
const BASE_STYLE: ResolvedStyle = {
    foreground: POPUP_CONFIG.textColor,
    background: undefined,
    fontFamily: POPUP_CONFIG.fontFamily,
    fontSize: POPUP_CONFIG.fontSize,
    format: TextFormat.NONE,
};

/** {@link BASE_STYLE} as a canvas font string, for the title and for buttons. */
const BASE_FONT = `${BASE_STYLE.fontSize}px ${BASE_STYLE.fontFamily}`;

/**
 * Draws a dimming layer plus `popup`, centred on the canvas.
 *
 * @param ctx - Canvas context to draw into.
 * @param canvasWidth - Canvas width, in canvas pixels.
 * @param canvasHeight - Canvas height, in canvas pixels.
 * @param popup - Popup to draw.
 */
export function drawPopup(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, popup: Popup): void {
    if (!popup.isOpen()) {
        return;
    }

    const title = popup.getTitle();
    const lines = popup.getLines().map(flattenLine);
    const buttons = popup.getButtons();
    const cursor = popup.getCursor();
    const buttonLabels = buttons.map((button) => `[${button.label}]`);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.font = POPUP_CONFIG.titleFont;
    const titleWidth = title ? ctx.measureText(title).width : 0;

    const lineRows = lines.map((runs) => measureLine(ctx, runs));

    ctx.font = BASE_FONT;
    const buttonWidths = buttonLabels.map((label) => ctx.measureText(label).width);
    const buttonRowWidth = buttonWidths.reduce((sum, w) => sum + w, 0)
        + POPUP_CONFIG.buttonGap * Math.max(buttons.length - 1, 0);

    const contentWidth = Math.max(titleWidth, buttonRowWidth, ...lineRows.map((row) => row.width), 0);
    const width = contentWidth + POPUP_CONFIG.padding * 2;

    const titleHeight = title ? POPUP_CONFIG.titleHeight : 0;
    const linesHeight = lineRows.reduce((sum, row) => sum + row.height, 0);
    const buttonRowHeight = buttons.length > 0 ? POPUP_CONFIG.buttonRowGap + POPUP_CONFIG.lineHeight : 0;
    const height = titleHeight + linesHeight + buttonRowHeight + POPUP_CONFIG.padding * 2;

    const x = (canvasWidth - width) / 2;
    const y = (canvasHeight - height) / 2;

    ctx.fillStyle = POPUP_CONFIG.dimColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = POPUP_CONFIG.backgroundColor;
    ctx.fillRect(x, y, width, height);

    let lineY = y + POPUP_CONFIG.padding;
    if (title) {
        ctx.fillStyle = POPUP_CONFIG.titleColor;
        ctx.font = POPUP_CONFIG.titleFont;
        ctx.fillText(title, x + POPUP_CONFIG.padding, lineY);
        lineY += titleHeight;
    }

    for (const row of lineRows) {
        drawRuns(ctx, row, x + POPUP_CONFIG.padding, lineY);
        lineY += row.height;
    }

    if (buttons.length > 0) {
        lineY += POPUP_CONFIG.buttonRowGap;
        ctx.font = BASE_FONT;
        let buttonX = x + POPUP_CONFIG.padding;
        const bounds: Rect[] = [];
        buttonLabels.forEach((label, i) => {
            const labelWidth = buttonWidths[i];
            const rect: Rect = {x: buttonX - 2, y: lineY - 2, w: labelWidth + 4, h: POPUP_CONFIG.lineHeight};
            bounds.push(rect);
            if (i === cursor) {
                ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
                ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            }
            ctx.fillStyle = POPUP_CONFIG.textColor;
            ctx.fillText(label, buttonX, lineY);
            buttonX += labelWidth + POPUP_CONFIG.buttonGap;
        });
        popup.setButtonBounds(bounds);
    } else {
        popup.setButtonBounds([]);
    }
}

/**
 * Resolves `style` against `inherited`, falling back to `inherited`'s fields
 * for whichever ones `style` leaves unset.
 *
 * @param style - Style to resolve, or `undefined` to just inherit outright.
 * @param inherited - Style already in effect where `style` appears.
 * @returns The resolved style.
 */
function resolveStyle(style: TextStyle | undefined, inherited: ResolvedStyle): ResolvedStyle {
    return {
        foreground: style?.foreground ?? inherited.foreground,
        background: style?.background ?? inherited.background,
        fontFamily: style?.fontFamily ?? inherited.fontFamily,
        fontSize: style?.fontSize ?? inherited.fontSize,
        format: style?.format ?? inherited.format,
    };
}

/**
 * Applies `format`'s `UPPERCASE`/`LOWERCASE` flags to `text`, if set.
 * `UPPERCASE` wins if both are somehow set.
 *
 * @param text - Text to transform.
 * @param format - Bitwise {@link TextFormat} flags.
 * @returns The transformed text.
 */
function applyCase(text: string, format: number): string {
    if (format & TextFormat.UPPERCASE) {
        return text.toUpperCase();
    }
    if (format & TextFormat.LOWERCASE) {
        return text.toLowerCase();
    }
    return text;
}

/**
 * Builds the canvas font string for a resolved style's family/size/bold/italic.
 *
 * @param style - Resolved style to build a font string for.
 * @returns The canvas font string.
 */
function buildFont(style: ResolvedStyle): string {
    const italic = style.format & TextFormat.ITALIC ? "italic " : "";
    const bold = style.format & TextFormat.BOLD ? "bold " : "";
    return `${italic}${bold}${style.fontSize}px ${style.fontFamily}`;
}

/**
 * Recursively flattens `segment` into leaf {@link ResolvedRun}s,
 * resolving each one's style against whatever it inherits from its parent.
 *
 * @param segment - Segment to flatten.
 * @param inherited - Style `segment` inherits fields it doesn't override.
 * @returns The flattened runs, in order.
 */
function flattenSegment(segment: TextSegment, inherited: ResolvedStyle): ResolvedRun[] {
    const style = resolveStyle(segment.style, inherited);
    if (typeof segment.content === "string") {
        return [{
            text: applyCase(segment.content, style.format),
            foreground: style.foreground,
            background: style.background,
            font: buildFont(style),
            fontSize: style.fontSize,
            underline: (style.format & TextFormat.UNDERLINE) !== 0,
        }];
    }
    return segment.content.flatMap((child) => flattenSegment(child, style));
}

/**
 * Flattens every top-level segment in `line` against {@link BASE_STYLE}.
 *
 * @param line - Line to flatten.
 * @returns The flattened runs, in order.
 */
function flattenLine(line: PopupLine): ResolvedRun[] {
    return line.flatMap((segment) => flattenSegment(segment, BASE_STYLE));
}

/** A flattened line's runs, plus its measured layout. */
interface MeasuredLine {
    runs: {run: ResolvedRun; width: number}[];
    width: number;
    height: number;
}

/**
 * Measures each of `runs`' widths (setting `ctx.font` per run first, since
 * they may each use a different font) and the line's overall width/height -
 * height is at least {@link POPUP_CONFIG.lineHeight}, but grows to fit a run
 * using a larger font.
 *
 * @param ctx - Canvas context to measure with.
 * @param runs - The line's flattened runs.
 * @returns The measured line.
 */
function measureLine(ctx: CanvasRenderingContext2D, runs: ResolvedRun[]): MeasuredLine {
    let width = 0;
    let maxFontSize = 0;
    const measured = runs.map((run) => {
        ctx.font = run.font;
        const runWidth = ctx.measureText(run.text).width;
        width += runWidth;
        maxFontSize = Math.max(maxFontSize, run.fontSize);
        return {run, width: runWidth};
    });
    return {runs: measured, width, height: Math.max(POPUP_CONFIG.lineHeight, maxFontSize + 6)};
}

/**
 * Draws a measured line's runs left-to-right from `x`, each with its own
 * font/colours, plus a background rect and/or underline where a run calls
 * for one.
 *
 * @param ctx - Canvas context to draw into.
 * @param line - The measured line to draw.
 * @param x - Left edge to start drawing from, in canvas pixels.
 * @param y - Top edge of the line, in canvas pixels.
 */
function drawRuns(ctx: CanvasRenderingContext2D, line: MeasuredLine, x: number, y: number): void {
    let runX = x;
    for (const {run, width} of line.runs) {
        ctx.font = run.font;
        if (run.background) {
            ctx.fillStyle = run.background;
            ctx.fillRect(runX, y - line.height / 4, width, line.height);
        }
        ctx.fillStyle = run.foreground;
        ctx.fillText(run.text, runX, y);
        if (run.underline) {
            const underlineY = y + run.fontSize + 2;
            ctx.strokeStyle = run.foreground;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(runX, underlineY);
            ctx.lineTo(runX + width, underlineY);
            ctx.stroke();
        }
        runX += width;
    }
}
