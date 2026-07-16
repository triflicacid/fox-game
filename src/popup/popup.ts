import {CheckboxInput, Input, NumberInput, PopupLine, PopupLineItem, RadioInput, TextFormat, TextSegment, TextStyle} from "./text-style";
import {Rect, pointInRect, rectsEqual} from "../geometry/rect";
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

/** A resolved, measured run within a line, alongside its measured width. */
interface MeasuredRun {
    run: ResolvedRun;
    width: number;
}

/** A resolved, measured plain-text item within a line. */
interface ResolvedTextElement {
    kind: "text";
    runs: MeasuredRun[];
    width: number;
}

/** A single resolved, measured option within a resolved radio input. */
interface ResolvedRadioOption {
    key: string;
    selected: boolean;
    labelRuns: MeasuredRun[];
    labelWidth: number;
    onSelect: (key: string) => void;
}

/** A resolved, measured radio input within a line. */
interface ResolvedRadioElement {
    kind: "radio";
    options: ResolvedRadioOption[];
    width: number;
}

/** A resolved, measured checkbox input within a line. */
interface ResolvedCheckboxElement {
    kind: "checkbox";
    checked: boolean;
    labelRuns: MeasuredRun[];
    labelWidth: number;
    onToggle: (checked: boolean) => void;
    width: number;
}

/** A resolved, measured number input within a line. */
interface ResolvedNumberElement {
    kind: "number";
    value: number;
    step: number;
    allowDecimal: boolean;
    onChange: (value: number) => void;
    width: number;
}

/**
 * Every kind of resolved, measured input element a line can contain -
 * mirrors {@link Input}.
 */
type ResolvedInputElement = ResolvedRadioElement | ResolvedCheckboxElement | ResolvedNumberElement;

type ResolvedElement = ResolvedTextElement | ResolvedInputElement;

/** A line's resolved items, plus its measured layout. */
interface MeasuredLine {
    elements: ResolvedElement[];
    width: number;
    height: number;
}

/**
 * Config to support editing for a {@link ResolvedNumberElement}.
 */
interface NumberEditHandle {
    getValue: () => number;
    step: number;
    allowDecimal: boolean;
    onChange: (value: number) => void;
}

/**
 * Anything a {@link Popup}'s keyboard cursor can land on and activate.
 */
interface FocusableElement {
    rect: Rect;
    activate: () => void;
    /** Present only for number-input focusables - see {@link Popup.handleNumberInputKey}. */
    numberEdit?: NumberEditHandle;
}

/** Determines if `item` is an {@link Input} (any kind - they all carry a `kind` field). */
function isInput(item: PopupLineItem): item is Input {
    return "kind" in item;
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

/**
 * Measures each of `runs`' widths (setting `ctx.font` per run first, since
 * they may each use a different font).
 */
function measureRuns(ctx: CanvasRenderingContext2D, runs: ResolvedRun[]): {measured: MeasuredRun[]; width: number; maxFontSize: number} {
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

/** Width a radio option's marker, marker/label gap, and label together occupy - excludes any gap to a sibling option. */
function radioOptionContentWidth(labelWidth: number): number {
    return POPUP_CONFIG.radioMarkerSize + POPUP_CONFIG.radioMarkerGap + labelWidth;
}

/**
 * Resolves and measures a {@link RadioInput}'s options, separated by {@link
 * POPUP_CONFIG.radioOptionGap} (none before the first or after the last).
 * The `width` this returns is what {@link layoutRadioElement}/{@link
 * paintRadioElement} actually walk through, so the two stay in agreement.
 */
function resolveRadioElement(ctx: CanvasRenderingContext2D, item: RadioInput): {element: ResolvedRadioElement; maxFontSize: number} {
    let width = 0;
    let maxFontSize = 0;
    const options: ResolvedRadioOption[] = item.options.map((option, i) => {
        const runs = option.content.flatMap((segment) => flattenSegment(segment, BASE_STYLE));
        const {measured, width: labelWidth, maxFontSize: labelFontSize} = measureRuns(ctx, runs);
        maxFontSize = Math.max(maxFontSize, labelFontSize);

        width += (i > 0 ? POPUP_CONFIG.radioOptionGap : 0) + radioOptionContentWidth(labelWidth);

        return {key: option.key, selected: option.key === item.selected, labelRuns: measured, labelWidth, onSelect: item.onSelect};
    });
    return {element: {kind: "radio", options, width}, maxFontSize};
}

/** Width a checkbox's box, box/label gap, and label together occupy. */
function checkboxContentWidth(labelWidth: number): number {
    return POPUP_CONFIG.checkboxSize + POPUP_CONFIG.checkboxGap + labelWidth;
}

/**
 * Resolves and measures a {@link CheckboxInput}'s label.
 */
function resolveCheckboxElement(ctx: CanvasRenderingContext2D, item: CheckboxInput): {element: ResolvedCheckboxElement; maxFontSize: number} {
    const runs = item.content.flatMap((segment) => flattenSegment(segment, BASE_STYLE));
    const {measured, width: labelWidth, maxFontSize} = measureRuns(ctx, runs);
    const width = checkboxContentWidth(labelWidth);
    return {element: {kind: "checkbox", checked: item.checked, labelRuns: measured, labelWidth, onToggle: item.onToggle, width}, maxFontSize};
}

/**
 * Resolves a {@link NumberInput}.
 */
function resolveNumberElement(item: NumberInput): {element: ResolvedNumberElement; maxFontSize: number} {
    return {
        element: {
            kind: "number",
            value: item.value,
            step: item.step ?? 1,
            allowDecimal: item.allowDecimal ?? false,
            onChange: item.onChange,
            width: POPUP_CONFIG.numberInputWidth,
        },
        maxFontSize: POPUP_CONFIG.fontSize,
    };
}

/**
 * Resolves and measures an {@link Input} into its {@link
 * ResolvedInputElement}, dispatching on `kind`. Add a case here (and a
 * matching `resolve*Element` function) for each new input kind - TypeScript
 * flags a missing case on its own once `Input` has more than one kind
 * (leaving this function without a return on every path).
 */
function resolveInputElement(ctx: CanvasRenderingContext2D, item: Input): {element: ResolvedInputElement; maxFontSize: number} {
    switch (item.kind) {
        case "radio":
            return resolveRadioElement(ctx, item);
        case "checkbox":
            return resolveCheckboxElement(ctx, item);
        case "number":
            return resolveNumberElement(item);
    }
}

/**
 * Resolves and measures every item in `line` - plain text segments flatten
 * to styled runs as before; inputs resolve via {@link resolveInputElement}.
 * The line's overall height is at least {@link POPUP_CONFIG.lineHeight}, but
 * grows to fit whichever run uses the largest font.
 */
function resolveLine(ctx: CanvasRenderingContext2D, line: PopupLine): MeasuredLine {
    let width = 0;
    let maxFontSize = 0;

    const elements: ResolvedElement[] = line.map((item) => {
        if (isInput(item)) {
            const {element, maxFontSize: inputFontSize} = resolveInputElement(ctx, item);
            maxFontSize = Math.max(maxFontSize, inputFontSize);
            width += element.width;
            return element;
        }

        const runs = flattenSegment(item, BASE_STYLE);
        const {measured, width: textWidth, maxFontSize: textFontSize} = measureRuns(ctx, runs);
        maxFontSize = Math.max(maxFontSize, textFontSize);
        width += textWidth;
        return {kind: "text", runs: measured, width: textWidth};
    });

    return {elements, width, height: Math.max(POPUP_CONFIG.lineHeight, maxFontSize + 6)};
}

/**
 * Draws a run of measured text left-to-right from `x`, each run with its own
 * styles applied - except `colorOverride`, if given, replaces every run's
 * own foreground colour (used to draw a focused input option's label in
 * {@link POPUP_CONFIG.highlightTextColor}).
 */
function drawRuns(ctx: CanvasRenderingContext2D, runs: MeasuredRun[], x: number, y: number, height: number, colorOverride?: string): void {
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
 * Draws a classic Windows 98 "sunken" radio marker at `(cx, cy)`: a white
 * circle with a shadow/dark-shadow bevel on its upper-left half and a
 * highlight/light bevel on its lower-right half (the inverse of {@link
 * drawWin98Border}'s raised look), with a solid dot in the centre when
 * `selected`.
 */
function drawRadioMarker(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, selected: boolean): void {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 0.5, Math.PI * 0.75, Math.PI * 1.75);
    ctx.strokeStyle = POPUP_CONFIG.borderShadowColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 0.5, Math.PI * -0.25, Math.PI * 0.75);
    ctx.strokeStyle = POPUP_CONFIG.borderHighlightColor;
    ctx.stroke();

    if (selected) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
    }
}

/**
 * Draws a classic Windows 98 "sunken" box.
 */
function drawSunkenBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
    drawBevelEdge(ctx, x, y, w, h, POPUP_CONFIG.borderShadowColor, POPUP_CONFIG.borderHighlightColor);
}

/**
 * Draws a classic Windows 98 "sunken" checkbox box at `(x, y)`.
 */
function drawCheckboxBox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, checked: boolean): void {
    drawSunkenBox(ctx, x, y, size, size);

    if (checked) {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.2, y + size * 0.55);
        ctx.lineTo(x + size * 0.42, y + size * 0.78);
        ctx.lineTo(x + size * 0.82, y + size * 0.22);
        ctx.stroke();
    }
}

/**
 * Computes a resolved radio element's options' on-screen rects, walking
 * left-to-right from `x` exactly as {@link paintRadioElement} draws them.
 * Each option activates by invoking its own `onSelect` with its `key`.
 */
function layoutRadioElement(element: ResolvedRadioElement, x: number, y: number, height: number): FocusableElement[] {
    const focusables: FocusableElement[] = [];
    let elemX = x;
    element.options.forEach((option, i) => {
        if (i > 0) {
            elemX += POPUP_CONFIG.radioOptionGap;
        }
        const optionWidth = radioOptionContentWidth(option.labelWidth);
        focusables.push({rect: {x: elemX, y, w: optionWidth, h: height}, activate: () => option.onSelect(option.key)});
        elemX += optionWidth;
    });
    return focusables;
}

/**
 * Draws a resolved radio element's marker circle plus label per option,
 * walking left-to-right from `x`.
 */
function paintRadioElement(
    ctx: CanvasRenderingContext2D,
    element: ResolvedRadioElement,
    x: number,
    y: number,
    height: number,
    focusedRect: Rect | null,
): void {
    let elemX = x;
    element.options.forEach((option, i) => {
        if (i > 0) {
            elemX += POPUP_CONFIG.radioOptionGap;
        }
        const optionWidth = radioOptionContentWidth(option.labelWidth);
        const rect: Rect = {x: elemX, y, w: optionWidth, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

        if (focused) {
            ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        const markerRadius = POPUP_CONFIG.radioMarkerSize / 2;
        drawRadioMarker(ctx, elemX + markerRadius, y + height / 2, markerRadius, option.selected);

        const labelX = elemX + POPUP_CONFIG.radioMarkerSize + POPUP_CONFIG.radioMarkerGap;
        drawRuns(ctx, option.labelRuns, labelX, y, height, focused ? POPUP_CONFIG.highlightTextColor : undefined);

        elemX += optionWidth;
    });
}

/** Computes a resolved checkbox element's on-screen rect. It activates by invoking `onToggle` with its flipped checked state. */
function layoutCheckboxElement(element: ResolvedCheckboxElement, x: number, y: number, height: number): FocusableElement[] {
    return [{rect: {x, y, w: element.width, h: height}, activate: () => element.onToggle(!element.checked)}];
}

/** Draws a resolved checkbox element's box plus label at `x`. */
function paintCheckboxElement(
    ctx: CanvasRenderingContext2D,
    element: ResolvedCheckboxElement,
    x: number,
    y: number,
    height: number,
    focusedRect: Rect | null,
): void {
    const rect: Rect = {x, y, w: element.width, h: height};
    const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

    if (focused) {
        ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    const boxY = y + (height - POPUP_CONFIG.checkboxSize) / 2;
    drawCheckboxBox(ctx, x, boxY, POPUP_CONFIG.checkboxSize, element.checked);

    const labelX = x + POPUP_CONFIG.checkboxSize + POPUP_CONFIG.checkboxGap;
    drawRuns(ctx, element.labelRuns, labelX, y, height, focused ? POPUP_CONFIG.highlightTextColor : undefined);
}

/**
 * Computes a resolved number element's on-screen rect.
 */
function layoutNumberElement(element: ResolvedNumberElement, x: number, y: number, height: number): FocusableElement[] {
    return [{
        rect: {x, y, w: element.width, h: height},
        activate: () => undefined,
        numberEdit: {getValue: () => element.value, step: element.step, allowDecimal: element.allowDecimal, onChange: element.onChange},
    }];
}

/**
 * Draws a resolved number element's box at `x`, showing `editText` in place
 * of its committed value while it's focused and being actively typed into.
 */
function paintNumberElement(
    ctx: CanvasRenderingContext2D,
    element: ResolvedNumberElement,
    x: number,
    y: number,
    height: number,
    focusedRect: Rect | null,
    editText: string | null,
): void {
    const rect: Rect = {x, y, w: element.width, h: height};
    const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

    if (focused) {
        ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    const boxHeight = POPUP_CONFIG.lineHeight - 4;
    const boxY = y + (height - boxHeight) / 2;
    drawSunkenBox(ctx, x, boxY, element.width, boxHeight);

    const text = focused && editText !== null ? editText : String(element.value);
    ctx.font = BASE_FONT;
    ctx.fillStyle = "#000000";
    ctx.fillText(text, x + POPUP_CONFIG.numberInputPadding, y + (height - POPUP_CONFIG.fontSize) / 2);
}

/**
 * Computes a resolved input element's focusable rects, dispatching on
 * `kind`.
 */
function layoutInputElement(element: ResolvedInputElement, x: number, y: number, height: number): FocusableElement[] {
    switch (element.kind) {
        case "radio":
            return layoutRadioElement(element, x, y, height);
        case "checkbox":
            return layoutCheckboxElement(element, x, y, height);
        case "number":
            return layoutNumberElement(element, x, y, height);
    }
}

/**
 * Draws a resolved input element, dispatching on `kind`. `editText` is only
 * meaningful for (and only passed on to) a `"number"` element.
 */
function paintInputElement(
    ctx: CanvasRenderingContext2D,
    element: ResolvedInputElement,
    x: number,
    y: number,
    height: number,
    focusedRect: Rect | null,
    editText: string | null,
): void {
    switch (element.kind) {
        case "radio":
            paintRadioElement(ctx, element, x, y, height, focusedRect);
            break;
        case "checkbox":
            paintCheckboxElement(ctx, element, x, y, height, focusedRect);
            break;
        case "number":
            paintNumberElement(ctx, element, x, y, height, focusedRect, editText);
            break;
    }
}

/**
 * Walks `lineRows` left-to-right within each line, top-down across lines,
 * exactly as {@link paintElements} draws them, computing every input
 * element's focusable rects (and what activating each one does) in
 * the order the user can navigate them.
 */
function layoutLines(lineRows: MeasuredLine[], startX: number, startY: number): FocusableElement[] {
    const focusables: FocusableElement[] = [];
    let lineY = startY;
    for (const line of lineRows) {
        let elemX = startX;
        for (const element of line.elements) {
            if (element.kind !== "text") {
                focusables.push(...layoutInputElement(element, elemX, lineY, line.height));
            }
            elemX += element.width;
        }
        lineY += line.height;
    }
    return focusables;
}

/**
 * Draws a resolved line's elements left-to-right from `x`: plain text runs
 * as-is, inputs via {@link paintInputElement}.
 */
function paintElements(
    ctx: CanvasRenderingContext2D,
    line: MeasuredLine,
    x: number,
    y: number,
    focusedRect: Rect | null,
    editText: string | null,
): void {
    let elemX = x;
    for (const element of line.elements) {
        if (element.kind === "text") {
            drawRuns(ctx, element.runs, elemX, y, line.height);
        } else {
            paintInputElement(ctx, element, elemX, y, line.height, focusedRect, editText);
        }
        elemX += element.width;
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
    /** Every button and input option currently on screen, sorted top-down then left-to-right; rebuilt each {@link draw}. */
    private focusables: FocusableElement[] = [];
    private cursor: number | null = 0;
    /**
     * The in-progress typed text for whichever number input is focused, if
     * any is currently being edited.
     */
    private numberEditBuffer: {cursor: number; text: string} | null = null;
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
     * Opens this popup, resetting its cursor to the first focusable element.
     */
    public show(): void {
        this.open = true;
        this.cursor = 0;
        this.numberEditBuffer = null;
    }

    /**
     * Closes this popup, committing any in-progress number-input edit first
     * so a typed value isn't lost.
     */
    public close(): void {
        this.commitPendingNumberEdit();
        this.open = false;
    }

    /**
     * Sets the content this popup displays. Safe to call every frame while
     * open.
     *
     * @param title - Title shown above the popup's lines of text.
     * @param lines - Lines of styled segments (and/or inputs) shown below the title.
     * @param buttons - Buttons shown in a row at the bottom, navigated by the cursor.
     */
    public setContent(title: string, lines: PopupLine[], buttons: PopupButton[]): void {
        this.title = title;
        this.lines = lines;
        this.buttons = buttons;
    }

    /**
     * Draws a dimming layer plus this popup, centred on the canvas.
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

        const lineRows = this.lines.map((line) => resolveLine(ctx, line));

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

        // Layout pass: resolve every focusable element's on-screen rect
        // before painting anything, so we know which one (if any) is
        // focused, and so a click can be hit-tested against the same rects.
        const linesStartY = y + POPUP_CONFIG.padding + titleHeight;
        const inputFocusables = layoutLines(lineRows, x + POPUP_CONFIG.padding, linesStartY);

        const buttonRowY = linesStartY + linesHeight + (this.buttons.length > 0 ? POPUP_CONFIG.buttonRowGap : 0);
        const buttonRects: Rect[] = [];
        let buttonLayoutX = x + POPUP_CONFIG.padding;
        buttonLabels.forEach((label, i) => {
            const labelWidth = buttonWidths[i];
            buttonRects.push({x: buttonLayoutX - 2, y: buttonRowY - 2, w: labelWidth + 4, h: POPUP_CONFIG.lineHeight});
            buttonLayoutX += labelWidth + POPUP_CONFIG.buttonGap;
        });

        this.focusables = [
            ...inputFocusables,
            ...buttonRects.map((rect, i): FocusableElement => ({rect, activate: () => this.buttons[i].onClick()})),
        ].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

        if (this.cursor !== null && this.cursor >= this.focusables.length) {
            this.setCursor(this.focusables.length > 0 ? this.focusables.length - 1 : null);
        }
        const focusedRect = this.cursor !== null ? this.focusables[this.cursor].rect : null;
        const editText = this.cursor !== null && this.numberEditBuffer?.cursor === this.cursor ? this.numberEditBuffer.text : null;

        // Paint pass.
        ctx.fillStyle = POPUP_CONFIG.dimColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.fillStyle = POPUP_CONFIG.backgroundColor;
        ctx.fillRect(x, y, width, height);
        drawWin98Border(ctx, x - BORDER_WIDTH, y - BORDER_WIDTH, width + BORDER_WIDTH * 2, height + BORDER_WIDTH * 2);

        if (this.title) {
            ctx.fillStyle = POPUP_CONFIG.titleColor;
            ctx.font = POPUP_CONFIG.titleFont;
            ctx.fillText(this.title, x + POPUP_CONFIG.padding, y + POPUP_CONFIG.padding);
        }

        let lineY = linesStartY;
        for (const row of lineRows) {
            paintElements(ctx, row, x + POPUP_CONFIG.padding, lineY, focusedRect, editText);
            lineY += row.height;
        }

        if (this.buttons.length > 0) {
            ctx.font = BASE_FONT;
            let buttonX = x + POPUP_CONFIG.padding;
            buttonLabels.forEach((label, i) => {
                const labelWidth = buttonWidths[i];
                const rect = buttonRects[i];
                const focused = focusedRect !== null && rectsEqual(rect, focusedRect);
                if (focused) {
                    ctx.fillStyle = POPUP_CONFIG.highlightBackgroundColor;
                    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
                }
                ctx.fillStyle = focused ? POPUP_CONFIG.highlightTextColor : POPUP_CONFIG.textColor;
                ctx.fillText(label, buttonX, buttonRowY);
                buttonX += labelWidth + POPUP_CONFIG.buttonGap;
            });
        }
    }

    /**
     * Moves the cursor one step through {@link focusables} in their sorted
     * (top-down, left-to-right) order, treating "nothing selected" (`null`)
     * as one extra stop between the last element and the first.
     *
     * @param delta - `1` to move to the next element, `-1` to move to the previous one.
     */
    private moveCursorHorizontal(delta: 1 | -1): void {
        const stopCount = this.focusables.length + 1;
        const currentStop = this.cursor === null ? 0 : this.cursor + 1;
        const nextStop = (currentStop + delta + stopCount) % stopCount;
        this.setCursor(nextStop === 0 ? null : nextStop - 1);
    }

    /**
     * Groups {@link focusables} (already sorted top-down, left-to-right)
     * into rows sharing the same `y`, preserving left-to-right order within
     * each row.
     *
     * @returns Every row of focusable elements, top to bottom.
     */
    private groupFocusablesByRow(): FocusableElement[][] {
        const rows: FocusableElement[][] = [];
        for (const focusable of this.focusables) {
            const lastRow = rows[rows.length - 1];
            if (lastRow && lastRow[0].rect.y === focusable.rect.y) {
                lastRow.push(focusable);
            } else {
                rows.push([focusable]);
            }
        }
        return rows;
    }

    /**
     * Moves the cursor to the next/previous row of {@link focusables} (by
     * `y`), landing on whichever element in that row is horizontally
     * closest to the currently focused one.
     *
     * @param delta - `1` to move to the next row down, `-1` to move to the previous row up.
     */
    private moveCursorVertical(delta: 1 | -1): void {
        const rows = this.groupFocusablesByRow();
        if (rows.length === 0) {
            return;
        }

        const currentRect = this.cursor !== null ? this.focusables[this.cursor].rect : null;
        const currentRowIndex = currentRect === null ? -1 : rows.findIndex((row) => row[0].rect.y === currentRect.y);

        const stopCount = rows.length + 1;
        const currentStop = currentRowIndex === -1 ? 0 : currentRowIndex + 1;
        const nextStop = (currentStop + delta + stopCount) % stopCount;

        if (nextStop === 0) {
            this.setCursor(null);
            return;
        }

        const targetRow = rows[nextStop - 1];
        const targetX = currentRect?.x ?? targetRow[0].rect.x;
        const closest = targetRow.reduce((best, candidate) =>
            Math.abs(candidate.rect.x - targetX) < Math.abs(best.rect.x - targetX) ? candidate : best);
        this.setCursor(this.focusables.indexOf(closest));
    }

    /**
     * Changes the cursor, first committing any in-progress number-input
     * edit belonging to the element being left.
     *
     * @param cursor - The new cursor value.
     */
    private setCursor(cursor: number | null): void {
        if (cursor === this.cursor) {
            return;
        }
        this.commitPendingNumberEdit();
        this.cursor = cursor;
    }

    /**
     * If {@link numberEditBuffer} holds an edit for the currently focused
     * element, parses it and calls that number input's `onChange` with the
     * result, then clears the buffer either way.
     */
    private commitPendingNumberEdit(): void {
        const buffer = this.numberEditBuffer;
        this.numberEditBuffer = null;
        if (buffer === null || this.cursor === null || buffer.cursor !== this.cursor) {
            return;
        }
        const numberEdit = this.focusables[this.cursor]?.numberEdit;
        if (!numberEdit) {
            return;
        }
        const parsed = parseFloat(buffer.text);
        numberEdit.onChange(Number.isNaN(parsed) ? numberEdit.getValue() : parsed);
    }

    /**
     * The focused number input's current value: the in-progress {@link
     * numberEditBuffer}'s parsed value if it's mid-edit and parses cleanly,
     * otherwise its last committed `value`.
     *
     * @param cursor - Index of the focused number input within {@link focusables}.
     * @param numberEdit - The focused number input's edit handle.
     * @returns Its current effective value.
     */
    private getEffectiveNumberValue(cursor: number, numberEdit: NumberEditHandle): number {
        if (this.numberEditBuffer?.cursor === cursor) {
            const parsed = parseFloat(this.numberEditBuffer.text);
            if (!Number.isNaN(parsed)) {
                return parsed;
            }
        }
        return numberEdit.getValue();
    }

    /**
     * Handles a key press while a number input is focused.
     *
     * Digits (and `.`, if `numberEdit.allowDecimal`) append to {@link
     * numberEditBuffer} without touching `value`; `Backspace`
     * removes the buffer's last character the same way. `ArrowUp`/
     * `ArrowDown` commit, then step {@link getEffectiveNumberValue} by
     * `numberEdit.step`. Every other key is ignored.
     *
     * @param cursor - Index of the focused number input within {@link focusables}.
     * @param numberEdit - The focused number input's edit handle.
     * @param event - The keyboard event.
     */
    private handleNumberInputKey(cursor: number, numberEdit: NumberEditHandle, event: KeyboardEvent): void {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const delta = event.key === "ArrowUp" ? numberEdit.step : -numberEdit.step;
            const next = this.getEffectiveNumberValue(cursor, numberEdit) + delta;
            this.numberEditBuffer = null;
            numberEdit.onChange(next);
            return;
        }
        if (event.key === "Enter") {
            this.moveCursorHorizontal(1);
            return;
        }

        const currentText = this.numberEditBuffer?.cursor === cursor ? this.numberEditBuffer.text : String(numberEdit.getValue());
        let nextText: string;
        if (event.key === "Backspace") {
            nextText = currentText.slice(0, -1);
        } else if (/^[0-9]$/.test(event.key)) {
            nextText = currentText + event.key;
        } else if (event.key === "." && numberEdit.allowDecimal && !currentText.includes(".")) {
            nextText = currentText + event.key;
        } else {
            return;
        }

        this.numberEditBuffer = {cursor, text: nextText};
    }

    /**
     * While open, intercepts every key press before any other key-driven
     * controller sees it: a configured close key shuts the popup.
     * `ArrowLeft`/`ArrowRight` move the cursor between {@link focusables} in
     * their sorted order (buttons and input options alike), `ArrowUp`/
     * `ArrowDown` move it to the closest element in the row above/below
     * (see {@link moveCursorVertical}), and `Enter`/`Space` activates
     * whichever one the cursor is currently on (if any).
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
        if (this.focusables.length === 0) {
            return;
        }

        // if a field is being edited, route through there instead
        const cursor = this.cursor;
        const numberEdit = cursor !== null ? this.focusables[cursor].numberEdit : undefined;
        if (cursor !== null && numberEdit && event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            this.handleNumberInputKey(cursor, numberEdit, event);
            return;
        }

        if (event.key === "ArrowLeft") {
            this.moveCursorHorizontal(-1);
        } else if (event.key === "ArrowRight") {
            this.moveCursorHorizontal(1);
        } else if (event.key === "ArrowUp") {
            this.moveCursorVertical(-1);
        } else if (event.key === "ArrowDown") {
            this.moveCursorVertical(1);
        } else if ((event.key === "Enter" || event.key === " ") && this.cursor !== null) {
            this.focusables[this.cursor].activate();
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
     * While open, hit-tests a click against {@link focusables} (as last laid
     * out by {@link draw}): a hit moves the cursor to that element and
     * activates it, same as pressing `Enter` while it's focused. Registered
     * on the capture phase and stops propagation while open, for the same
     * reason as {@link handleMouseDown}.
     *
     * @param event - The mouse event.
     */
    private readonly handleClick = (event: MouseEvent): void => {
        if (!this.open) {
            return;
        }
        event.stopPropagation();

        const index = this.focusables.findIndex((focusable) => pointInRect(event.clientX, event.clientY, focusable.rect));
        if (index === -1) {
            return;
        }
        this.setCursor(index);
        this.focusables[index].activate();
    };
}
