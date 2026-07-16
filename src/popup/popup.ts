import {PopupLine, TextFormat, TextSegment, TextStyle} from "./text-style";
import {Rect, pointInRect} from "../geometry/rect";
import {POPUP_CONFIG} from "./popup-config";

/** A single button in a {@link Popup}'s button row. */
export interface PopupButton {
    /** Text shown for the button, wrapped in `[...]` when drawn. */
    label: string;
    /** Invoked when the button is selected (via {@link Popup}'s keyboard cursor, or a mouse click). */
    onClick: () => void;
}

/** Configures a {@link Popup} at construction. */
export interface PopupOptions {
    /**
     * Keys that close the popup outright (bypassing button selection)
     * whenever it's open. Defaults to `["Escape"]`.
     */
    closeKeys?: string[];
}

/** A {@link TextStyle} with every field resolved to a concrete value. */
interface ResolvedStyle {
    foreground: string;
    background: string | undefined;
    fontFamily: string;
    fontSize: number;
    format: number;
}

/** A single flattened, styled run of text. */
interface ResolvedRun {
    text: string;
    foreground: string;
    background: string | undefined;
    font: string;
    fontSize: number;
    underline: boolean;
}

/** A flattened line's runs, plus its measured layout. */
interface MeasuredLine {
    runs: {run: ResolvedRun; width: number}[];
    width: number;
    height: number;
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

/** Thickness of the Windows-98-style border drawn by {@link drawWin98Border}, in canvas pixels. */
const BORDER_WIDTH = 2;

/**
 * Draws a two-tone bevel edge: `topLeft` along the top and left sides of the
 * `w`×`h` box at `x, y`, `bottomRight` along its bottom and right, each 1
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

/**
 * Draws a classic Windows 98 "raised" border, {@link BORDER_WIDTH} pixels
 * thick, around the `w` x `h` box at `x, y`.
 */
function drawWin98Border(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    drawBevelEdge(ctx, x, y, w, h, POPUP_CONFIG.borderHighlightColor, POPUP_CONFIG.borderDarkShadowColor);
    drawBevelEdge(ctx, x + 1, y + 1, w - 2, h - 2, POPUP_CONFIG.borderLightColor, POPUP_CONFIG.borderShadowColor);
}

/**
 * Resolves `style` against `inherited`, falling back to `inherited`'s fields
 * for whichever ones `style` leaves unset.
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
 * `UPPERCASE` wins if both are set.
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

/** Builds the canvas font string for a resolved style's family/size/bold/italic. */
function buildFont(style: ResolvedStyle): string {
    const italic = style.format & TextFormat.ITALIC ? "italic " : "";
    const bold = style.format & TextFormat.BOLD ? "bold " : "";
    return `${italic}${bold}${style.fontSize}px ${style.fontFamily}`;
}

/**
 * Recursively flattens `segment` into {@link ResolvedRun}s, resolving each
 * one's style against whatever it inherits from its parent.
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

/** Flattens every top-level segment in `line` against {@link BASE_STYLE}. */
function flattenLine(line: PopupLine): ResolvedRun[] {
    return line.flatMap((segment) => flattenSegment(segment, BASE_STYLE));
}

/**
 * Measures each of `runs`' widths (setting `ctx.font` per run first, since
 * they may each use a different font) and the line's overall width/height -
 * height is at least {@link POPUP_CONFIG.lineHeight}, but grows to fit a run
 * using a larger font.
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

/** Draws a measured line's runs left-to-right from `x`, each with its own styles applied. */
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

/**
 * A generic modal popup: a title, some lines of text, and a row of buttons
 * navigated by a keyboard cursor or clicked directly. While open, it takes
 * over the keyboard and mouse entirely (see {@link handleKeyDown}/{@link
 * handleMouseDown}/{@link handleClick}), so nothing behind it reacts to
 * input until it's closed. Call {@link draw} once per frame to render it.
 */
export class Popup {
    private open = false;
    private title = "";
    private lines: PopupLine[] = [];
    private buttons: PopupButton[] = [];
    private buttonBounds: Rect[] = [];
    private cursor: number | null = 0;
    private readonly closeKeys: ReadonlySet<string>;

    /**
     * @param options - Configures this popup. See {@link PopupOptions}.
     */
    public constructor(options: PopupOptions = {}) {
        this.closeKeys = new Set(options.closeKeys ?? ["Escape"]);
        window.addEventListener("keydown", this.handleKeyDown, {capture: true});
        window.addEventListener("mousedown", this.handleMouseDown, {capture: true});
        window.addEventListener("click", this.handleClick, {capture: true});
    }

    /**
     * Whether this popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    public isOpen(): boolean {
        return this.open;
    }

    /**
     * Opens this popup, resetting its button cursor to the first button.
     */
    public show(): void {
        this.open = true;
        this.cursor = 0;
    }

    /**
     * Closes this popup.
     */
    public close(): void {
        this.open = false;
    }

    /**
     * Sets the content this popup displays. Safe to call every frame while
     * open, e.g. to keep dynamic text (like key bindings that vary by mode)
     * up to date.
     *
     * @param title - Title shown above the popup's lines of text.
     * @param lines - Lines of styled segments shown below the title.
     * @param buttons - Buttons shown in a row at the bottom, navigated by the cursor.
     */
    public setContent(title: string, lines: PopupLine[], buttons: PopupButton[]): void {
        this.title = title;
        this.lines = lines;
        this.buttons = buttons;
        if (buttons.length === 0) {
            this.cursor = null;
        } else if (this.cursor !== null && this.cursor >= buttons.length) {
            this.cursor = buttons.length - 1;
        }
    }

    /**
     * Draws a dimming layer plus this popup, centred on the canvas: its
     * title, lines, and button row (with whichever button the cursor is on
     * highlighted - white text on a dark blue background). Also records each
     * button's on-screen bounds for {@link handleClick} to hit-test against.
     * A no-op if the popup isn't open.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        if (!this.open) {
            return;
        }

        const buttonLabels = this.buttons.map((button) => `[${button.label}]`);

        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        ctx.font = POPUP_CONFIG.titleFont;
        const titleWidth = this.title ? ctx.measureText(this.title).width : 0;

        const lineRows = this.lines.map((line) => measureLine(ctx, flattenLine(line)));

        ctx.font = BASE_FONT;
        const buttonWidths = buttonLabels.map((label) => ctx.measureText(label).width);
        const buttonRowWidth = buttonWidths.reduce((sum, w) => sum + w, 0)
            + POPUP_CONFIG.buttonGap * Math.max(this.buttons.length - 1, 0);

        const contentWidth = Math.max(titleWidth, buttonRowWidth, ...lineRows.map((row) => row.width), 0);
        const width = contentWidth + POPUP_CONFIG.padding * 2;

        const titleHeight = this.title ? POPUP_CONFIG.titleHeight : 0;
        const linesHeight = lineRows.reduce((sum, row) => sum + row.height, 0);
        const buttonRowHeight = this.buttons.length > 0 ? POPUP_CONFIG.buttonRowGap + POPUP_CONFIG.lineHeight : 0;
        const height = titleHeight + linesHeight + buttonRowHeight + POPUP_CONFIG.padding * 2;

        const x = (canvasWidth - width) / 2;
        const y = (canvasHeight - height) / 2;

        ctx.fillStyle = POPUP_CONFIG.dimColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.fillStyle = POPUP_CONFIG.backgroundColor;
        ctx.fillRect(x, y, width, height);
        drawWin98Border(ctx, x - BORDER_WIDTH, y - BORDER_WIDTH, width + BORDER_WIDTH * 2, height + BORDER_WIDTH * 2);

        let lineY = y + POPUP_CONFIG.padding;
        if (this.title) {
            ctx.fillStyle = POPUP_CONFIG.titleColor;
            ctx.font = POPUP_CONFIG.titleFont;
            ctx.fillText(this.title, x + POPUP_CONFIG.padding, lineY);
            lineY += titleHeight;
        }

        for (const row of lineRows) {
            drawRuns(ctx, row, x + POPUP_CONFIG.padding, lineY);
            lineY += row.height;
        }

        if (this.buttons.length > 0) {
            lineY += POPUP_CONFIG.buttonRowGap;
            ctx.font = BASE_FONT;
            let buttonX = x + POPUP_CONFIG.padding;
            const bounds: Rect[] = [];
            buttonLabels.forEach((label, i) => {
                const labelWidth = buttonWidths[i];
                const rect: Rect = {x: buttonX - 2, y: lineY - 2, w: labelWidth + 4, h: POPUP_CONFIG.lineHeight};
                bounds.push(rect);
                const highlighted = i === this.cursor;
                if (highlighted) {
                    ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
                    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
                }
                ctx.fillStyle = highlighted ? POPUP_CONFIG.highlightTextColor : POPUP_CONFIG.textColor;
                ctx.fillText(label, buttonX, lineY);
                buttonX += labelWidth + POPUP_CONFIG.buttonGap;
            });
            this.buttonBounds = bounds;
        } else {
            this.buttonBounds = [];
        }
    }

    /**
     * Moves the cursor one step left/right through {@link buttons}, treating
     * "nothing selected" (`null`) as one extra stop between the last button
     * and the first, so repeatedly pressing the same arrow key cycles
     * through every button and back to no selection.
     *
     * @param delta - `1` to move right, `-1` to move left.
     */
    private moveCursor(delta: 1 | -1): void {
        const stopCount = this.buttons.length + 1;
        const currentStop = this.cursor === null ? 0 : this.cursor + 1;
        const nextStop = (currentStop + delta + stopCount) % stopCount;
        this.cursor = nextStop === 0 ? null : nextStop - 1;
    }

    /**
     * While open, intercepts every key press before any other key-driven
     * controller sees it: a configured close key shuts the popup; otherwise
     * `ArrowLeft`/`ArrowRight` move the cursor between buttons,
     * and `Enter`/`Space` activates whichever button the cursor is currently on (if any).
     *
     * @param event - The keyboard event.
     */
    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.open) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (this.closeKeys.has(event.key)) {
            this.close();
            return;
        }
        if (this.buttons.length === 0) {
            return;
        }
        if (event.key === "ArrowLeft") {
            this.moveCursor(-1);
        } else if (event.key === "ArrowRight") {
            this.moveCursor(1);
        } else if ((event.key === "Enter" || event.key === " ") && this.cursor !== null) {
            this.buttons[this.cursor].onClick();
        }
    };

    /**
     * While open, swallows every `mousedown` before it reaches anything
     * behind the popup (e.g. {@link CameraDragController}'s canvas
     * listener), so clicking a button can't also start a camera drag.
     *
     * @param event - The mouse event.
     */
    private readonly handleMouseDown = (event: MouseEvent): void => {
        if (this.open) {
            event.stopPropagation();
        }
    };

    /**
     * While open, hit-tests a click against {@link buttonBounds} (as last
     * recorded by {@link draw}): a hit moves the cursor to that button and
     * activates it. Registered on the capture phase and stops propagation
     * while open, for the same reason as {@link handleMouseDown}.
     *
     * @param event - The mouse event.
     */
    private readonly handleClick = (event: MouseEvent): void => {
        if (!this.open) {
            return;
        }
        event.stopPropagation();

        const index = this.buttonBounds.findIndex((bounds) => pointInRect(event.clientX, event.clientY, bounds));
        if (index === -1) {
            return;
        }
        this.cursor = index;
        this.buttons[index].onClick();
    };
}
