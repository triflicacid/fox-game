import {TextFormat, TextSegment, TextStyle} from "./text-style";

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

/** A resolved, measured run within a line, alongside its measured width. */
export interface MeasuredRun {
    run: ResolvedRun;
    width: number;
}

/** A line's runs, resolved and measured against a {@link Display}'s defaults. */
export interface MeasuredRunLine {
    runs: MeasuredRun[];
    /** Total width of every run in the line, in canvas pixels. */
    width: number;
    /** The largest font size used by any run in the line, in canvas pixels. */
    maxFontSize: number;
}

/** A {@link MeasuredRunLine} with its final on-screen line height decided. */
export interface MeasuredLine extends MeasuredRunLine {
    height: number;
}

/**
 * Default text style and minimum line height a {@link Display} falls back
 * to for top-level segments and for lines with no larger font in them.
 */
export interface DisplayDefaults {
    /** Default text colour. */
    foreground: string;
    /** Default font family. */
    fontFamily: string;
    /** Default font size, in canvas pixels. */
    fontSize: number;
    /** Minimum line height, in canvas pixels - see {@link Display.lineHeightFor}. */
    lineHeight: number;
}

/** Fallback {@link DisplayDefaults} used for any field a {@link Display} isn't given. */
export const DEFAULT_DISPLAY_DEFAULTS: DisplayDefaults = {
    foreground: "#000000",
    fontFamily: "monospace",
    fontSize: 14,
    lineHeight: 20,
};

/**
 * Resolves, measures, and draws lines of styled {@link TextSegment} text.
 */
export class Display {
    private readonly baseStyle: ResolvedStyle;
    private readonly lineHeight: number;

    /**
     * @param defaults - Default style and minimum line height for this display. Any field left unset falls back to {@link DEFAULT_DISPLAY_DEFAULTS}.
     */
    public constructor(defaults: Partial<DisplayDefaults> = {}) {
        const resolved: DisplayDefaults = {...DEFAULT_DISPLAY_DEFAULTS, ...defaults};
        this.baseStyle = {
            foreground: resolved.foreground,
            background: undefined,
            fontFamily: resolved.fontFamily,
            fontSize: resolved.fontSize,
            format: TextFormat.NONE,
        };
        this.lineHeight = resolved.lineHeight;
    }

    /**
     * Resolves `style` against `inherited`, falling back to `inherited`'s
     * fields for whichever ones `style` leaves unset.
     */
    private resolveStyle(style: TextStyle | undefined, inherited: ResolvedStyle): ResolvedStyle {
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
    private applyCase(text: string, format: number): string {
        if (format & TextFormat.UPPERCASE) {
            return text.toUpperCase();
        }
        if (format & TextFormat.LOWERCASE) {
            return text.toLowerCase();
        }
        return text;
    }

    /** Builds the canvas font string for a resolved style's family/size/bold/italic. */
    private buildFont(style: ResolvedStyle): string {
        const italic = style.format & TextFormat.ITALIC ? "italic " : "";
        const bold = style.format & TextFormat.BOLD ? "bold " : "";
        return `${italic}${bold}${style.fontSize}px ${style.fontFamily}`;
    }

    /** Swaps a resolved style's `foreground`/`background` - a no-op when `background` is unset, since there's nothing to move into `foreground`. */
    private invertStyle(style: ResolvedStyle): ResolvedStyle {
        return style.background === undefined ? style : {...style, foreground: style.background, background: style.foreground};
    }

    /** Applies `segmentStyle`'s `invert`/`invertFormat`/`fontSizeDelta` to `resolved` - see {@link TextStyle}. */
    private adjustStyle(segmentStyle: TextStyle | undefined, resolved: ResolvedStyle): ResolvedStyle {
        let style = segmentStyle?.invert ? this.invertStyle(resolved) : resolved;
        if (segmentStyle?.invertFormat) {
            style = {...style, format: style.format & ~segmentStyle.invertFormat};
        }
        if (segmentStyle?.fontSizeDelta !== undefined) {
            const delta = segmentStyle.fontSizeDelta;
            style = {...style, fontSize: typeof delta === "number" ? style.fontSize + delta : delta(style.fontSize)};
        }
        return style;
    }

    /**
     * Recursively flattens `segment` into {@link ResolvedRun}s, resolving
     * each one's style against whatever it inherits from its parent. A
     * `hidden` segment (or its children) contributes nothing, as if absent.
     */
    private flattenSegment(segment: TextSegment, inherited: ResolvedStyle): ResolvedRun[] {
        if (segment.hidden) {
            return [];
        }
        const style = this.adjustStyle(segment.style, this.resolveStyle(segment.style, inherited));
        if (typeof segment.content === "string") {
            return [{
                text: this.applyCase(segment.content, style.format),
                foreground: style.foreground,
                background: style.background,
                font: this.buildFont(style),
                fontSize: style.fontSize,
                underline: (style.format & TextFormat.UNDERLINE) !== 0,
            }];
        }
        return segment.content.flatMap((child) => this.flattenSegment(child, style));
    }

    /**
     * Measures each of `runs`' widths (setting `ctx.font` per run first,
     * since they may each use a different font).
     */
    private measureRuns(ctx: CanvasRenderingContext2D, runs: ResolvedRun[]): {measured: MeasuredRun[]; width: number; maxFontSize: number} {
        let width = 0;
        let maxFontSize = 0;
        const measured = runs.map((run) => {
            ctx.font = run.font;
            const runWidth = ctx.measureText(run.text).width;
            width += runWidth;
            maxFontSize = Math.max(maxFontSize, run.fontSize);
            return {run, width: runWidth};
        });
        return {measured, width, maxFontSize};
    }

    /**
     * Resolves and measures one line's top-level `segments` against this
     * display's defaults.
     *
     * @param ctx - Canvas context, used to measure text widths.
     * @param segments - The line's top-level segments.
     * @returns The line's flattened, measured runs.
     */
    public resolveLine(ctx: CanvasRenderingContext2D, segments: TextSegment[]): MeasuredRunLine {
        const runs = segments.flatMap((segment) => this.flattenSegment(segment, this.baseStyle));
        const {measured, width, maxFontSize} = this.measureRuns(ctx, runs);
        return {runs: measured, width, maxFontSize};
    }

    /**
     * The line height to use for a line whose runs' largest font size is
     * `maxFontSize`: this display's configured minimum, or a bit more than
     * the font size itself if that's larger.
     *
     * @param maxFontSize - The largest font size, in canvas pixels, used by any run in the line.
     * @returns The line height to draw at, in canvas pixels.
     */
    public lineHeightFor(maxFontSize: number): number {
        if (maxFontSize === 0) {
            return 0;
        }
        return Math.max(this.lineHeight, maxFontSize + 6);
    }

    /**
     * Draws a run of measured text left-to-right from `x`, each run with
     * its own styles applied - except `colorOverride`, if given, replaces
     * every run's own foreground colour.
     *
     * @param ctx - Canvas context to draw into.
     * @param runs - The line's resolved, measured runs, as returned by {@link resolveLine}.
     * @param x - Left edge to start drawing from, in canvas pixels.
     * @param y - Baseline-independent top of the line, in canvas pixels (assumes `ctx.textBaseline = "top"`).
     * @param height - The line's height, used to size each run's own background rect.
     * @param colorOverride - If given, overrides every run's foreground colour.
     */
    public drawLine(ctx: CanvasRenderingContext2D, runs: MeasuredRun[], x: number, y: number, height: number, colorOverride?: string): void {
        let runX = x;
        for (const {run, width} of runs) {
            ctx.font = run.font;
            if (run.background) {
                ctx.fillStyle = run.background;
                ctx.fillRect(runX, y - height / 4, width, height);
            }
            ctx.fillStyle = colorOverride ?? run.foreground;
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
     * Resolves and measures a stack of text-only `lines`, plus the overall
     * padded block they occupy stacked top to bottom.
     *
     * @param ctx - Canvas context, used to measure text widths.
     * @param lines - Each line's top-level segments, top to bottom.
     * @param padding - Padding added around the content on every side, in canvas pixels.
     * @returns Each resolved line (with its final height), plus the padded block's overall width/height.
     */
    public layoutBlock(ctx: CanvasRenderingContext2D, lines: TextSegment[][], padding: number): {lines: MeasuredLine[]; width: number; height: number} {
        const resolvedLines = lines.map((segments) => {
            const line = this.resolveLine(ctx, segments);
            return {...line, height: this.lineHeightFor(line.maxFontSize)};
        });
        const width = Math.max(0, ...resolvedLines.map((line) => line.width)) + padding * 2;
        const height = resolvedLines.reduce((sum, line) => sum + line.height, 0) + padding * 2;
        return {lines: resolvedLines, width, height};
    }
}
