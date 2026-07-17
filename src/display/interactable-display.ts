import {DEFAULT_DISPLAY_DEFAULTS, Display, DisplayDefaults, MeasuredRun} from "./display";
import {ButtonInput, CheckboxInput, DisplayLine, DisplayLineItem, HighlightStyle, Input, NumberInput, RadioInput, SelectInput} from "./input";
import {ChromeTheme} from "./chrome-theme";
import {Rect, pointInRect, rectsEqual} from "../geometry/rect";

/** Whether keyboard input reaches an {@link InteractableDisplay} whenever it's active ("always"), or only after it's been clicked into ("click"). */
export type FocusMode = "always" | "click";

/** {@link DisplayDefaults} plus the geometry an {@link InteractableDisplay}'s input elements are laid out with. */
export interface InteractableDisplayDefaults extends DisplayDefaults {
    /** Diameter of a radio input's marker circle, in canvas pixels. */
    radioMarkerSize: number;
    /** Gap between a radio option's marker and its label, in canvas pixels. */
    radioMarkerGap: number;
    /** Horizontal gap between consecutive options within a radio input, in canvas pixels. */
    radioOptionGap: number;
    /** Width/height of a checkbox input's box, in canvas pixels. */
    checkboxSize: number;
    /** Gap between a checkbox's box and its label, in canvas pixels. */
    checkboxGap: number;
    /** Width of a number input's box, in canvas pixels - fixed, regardless of the value's length. */
    numberInputWidth: number;
    /** Horizontal padding inside a number input's box, in canvas pixels. */
    numberInputPadding: number;
    /** Half-period of a number input's blinking edit cursor, in milliseconds. */
    cursorBlinkIntervalMs: number;
    /** Horizontal padding inside a select input's box and dropdown rows, in canvas pixels. */
    selectPadding: number;
    /** Width of a select input's dropdown-arrow button, in canvas pixels. */
    selectArrowWidth: number;
    /** Padding added around a number/select input's sunken box when drawing its focus highlight, in canvas pixels. */
    focusHighlightPadding: number;
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
    highlightStyle: HighlightStyle;
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
    highlightStyle: HighlightStyle;
    width: number;
}

/** A resolved, measured number input within a line. */
interface ResolvedNumberElement {
    kind: "number";
    value: number;
    step: number;
    allowDecimal: boolean;
    onChange: (value: number) => void;
    highlightStyle: HighlightStyle;
    width: number;
}

/** A resolved, measured button - "[Label]". */
export interface ResolvedButtonElement {
    kind: "button";
    text: string;
    onClick: () => void;
    highlightStyle: HighlightStyle;
    width: number;
}

/** A single resolved, measured option within a resolved select input. */
interface ResolvedSelectOption {
    key: string;
    labelRuns: MeasuredRun[];
    labelWidth: number;
    highlightStyle: HighlightStyle;
}

/**
 * A resolved, measured select (dropdown) input within a line. `width` is
 * sized to fit the widest option's label plus the dropdown arrow.
 */
interface ResolvedSelectElement {
    kind: "select";
    options: ResolvedSelectOption[];
    /** Index into `options` of the currently selected one; `0` if `selected` matched none. */
    selectedIndex: number;
    onSelect: (key: string) => void;
    highlightStyle: HighlightStyle;
    width: number;
}

/** Every kind of resolved, measured input element a line can contain - mirrors {@link Input}. */
type ResolvedInputElement = ResolvedRadioElement | ResolvedCheckboxElement | ResolvedNumberElement | ResolvedButtonElement | ResolvedSelectElement;

type ResolvedElement = ResolvedTextElement | ResolvedInputElement;

/** A line's resolved elements, plus its measured layout - see {@link InteractableDisplay.resolveElements}. */
export interface ResolvedElementLine {
    elements: ResolvedElement[];
    width: number;
    height: number;
}

/** Config to support editing for a {@link ResolvedNumberElement}. */
interface NumberEditHandle {
    getValue: () => number;
    step: number;
    allowDecimal: boolean;
    onChange: (value: number) => void;
}

/** Config to support opening/navigating a {@link ResolvedSelectElement}. */
interface SelectEditHandle {
    options: ResolvedSelectOption[];
    selectedKey: string;
    onSelect: (key: string) => void;
}

/** Anything an {@link InteractableDisplay}'s keyboard cursor can land on and activate. */
export interface FocusableElement {
    rect: Rect;
    activate: () => void;
    /** Present only for number-input focusables - see {@link InteractableDisplay.handleNumberInputKey}. */
    numberEdit?: NumberEditHandle;
    /** Present only for select-input focusables - see {@link InteractableDisplay.handleSelectInputKey}. */
    selectEdit?: SelectEditHandle;
}

/** Fallback {@link InteractableDisplayDefaults} used for any field an {@link InteractableDisplay} isn't given. */
export const DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS: InteractableDisplayDefaults = {
    ...DEFAULT_DISPLAY_DEFAULTS,
    radioMarkerSize: 12,
    radioMarkerGap: 6,
    radioOptionGap: 16,
    checkboxSize: 12,
    checkboxGap: 6,
    numberInputWidth: 48,
    numberInputPadding: 4,
    cursorBlinkIntervalMs: 500,
    selectPadding: 4,
    selectArrowWidth: 18,
    focusHighlightPadding: 2,
};

/** Determines if `item` is an {@link Input} (any kind - they all carry a `kind` field). */
function isInput(item: DisplayLineItem): item is Input {
    return "kind" in item;
}

/**
 * A {@link Display} that also lays out, paints, and drives keyboard/mouse
 * interaction for {@link Input} elements mixed in among plain text, themed
 * by a {@link ChromeTheme}.
 *
 * Keyboard input only reaches it while {@link isFocused} - in `"always"`
 * mode that's simply whenever it's {@link setActive active};
 * in `"click"` mode, focus is gained by a clicking on it {@link setBounds its bounds}
 * and lost by a click off it.
 */
export class InteractableDisplay extends Display {
    private readonly theme: ChromeTheme;
    private readonly defaults: InteractableDisplayDefaults;
    private readonly focusMode: FocusMode;
    private readonly plainFont: string;

    private active = false;
    private focused = false;
    private bounds: Rect | null = null;
    private keyDownInterceptor: ((event: KeyboardEvent) => boolean) | undefined;

    private focusables: FocusableElement[] = [];
    private cursor: number | null = null;
    /** The in-progress typed text for whichever number input is being edited, if any - kept in lockstep with {@link editingNumberCursor}. */
    private numberEditBuffer: {cursor: number; text: string} | null = null;
    /** Index into {@link focusables} of the number input currently in edit mode, if any. */
    private editingNumberCursor: number | null = null;
    /** Index into {@link focusables} of the select input whose dropdown is currently open, if any. */
    private openSelectCursor: number | null = null;
    /** Index into the open select's `options` currently highlighted, while a dropdown is open. */
    private openSelectHighlight = 0;
    /** The open select's option rows' on-screen rects, as last painted - for hit-testing clicks. */
    private openSelectDropdownRects: Rect[] | null = null;

    /**
     * @param defaults - Default text style, minimum line height, and input geometry. Any field left unset falls back to {@link DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS}.
     * @param theme - Chrome (borders/boxes/markers) this display paints its inputs and panel with.
     * @param focusMode - Whether this display is always focused while active, or only once clicked into.
     */
    public constructor(defaults: Partial<InteractableDisplayDefaults>, theme: ChromeTheme, focusMode: FocusMode) {
        const resolved: InteractableDisplayDefaults = {...DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS, ...defaults};
        super(resolved);
        this.defaults = resolved;
        this.theme = theme;
        this.focusMode = focusMode;
        this.plainFont = `${resolved.fontSize}px ${resolved.fontFamily}`;
        window.addEventListener("keydown", this.handleKeyDown, {capture: true});
        window.addEventListener("mousedown", this.handleMouseDown, {capture: true});
        window.addEventListener("click", this.handleClick, {capture: true});
    }

    /**
     * Marks this display active (or not), resetting its cursor/edit state.
     *
     * @param active - Whether this display is currently shown/interactive at all.
     */
    public setActive(active: boolean): void {
        if (active) {
            this.active = true;
            this.cursor = 0;
            this.numberEditBuffer = null;
            this.editingNumberCursor = null;
            this.openSelectCursor = null;
            this.openSelectHighlight = 0;
            this.focused = this.focusMode === "always";
        } else {
            this.commitPendingNumberEdit();
            this.active = false;
            this.focused = false;
        }
    }

    /**
     * Whether this display is currently active (shown/interactive at all).
     *
     * @returns `true` if active.
     */
    public isActive(): boolean {
        return this.active;
    }

    /**
     * Whether this display currently accepts keyboard input
     *
     * @returns `true` if focused.
     */
    public isFocused(): boolean {
        return this.focusMode === "always" ? this.active : this.focused;
    }

    /**
     * Sets this display's on-screen bounds, used in `"click"` focus mode to
     * decide whether a click focuses or blurs it. Unused in `"always"` mode.
     *
     * @param rect - This display's current on-screen bounds, or `null` if not shown.
     */
    public setBounds(rect: Rect | null): void {
        this.bounds = rect;
    }

    /**
     * Installs a hook invoked before any built-in key handling, whenever
     * this display is focused and no select-dropdown/number-edit is
     * intercepting the key first.Returning `true` skips the built-in
     * cursor/activation handling for that key.
     *
     * @param fn - The hook, or `undefined` to remove it.
     */
    public setKeyDownInterceptor(fn: ((event: KeyboardEvent) => boolean) | undefined): void {
        this.keyDownInterceptor = fn;
    }

    /** Style a focused element falls back to when it (or its owning input) doesn't specify its own. */
    private fillHighlightStyle(highlightStyle: Partial<HighlightStyle> | null | undefined): HighlightStyle {
        return {
            background: highlightStyle?.background ?? this.theme.highlightBackground,
            foreground: highlightStyle?.foreground ?? this.theme.highlightForeground,
        };
    }

    /** Width a radio option's marker, marker/label gap, and label together occupy - excludes any gap to a sibling option. */
    private radioOptionContentWidth(labelWidth: number): number {
        return this.defaults.radioMarkerSize + this.defaults.radioMarkerGap + labelWidth;
    }

    /** Width a checkbox's box, box/label gap, and label together occupy. */
    private checkboxContentWidth(labelWidth: number): number {
        return this.defaults.checkboxSize + this.defaults.checkboxGap + labelWidth;
    }

    /**
     * Resolves and measures a {@link RadioInput}'s options, separated by
     * {@link InteractableDisplayDefaults.radioOptionGap} (none before the
     * first or after the last).
     */
    private resolveRadio(ctx: CanvasRenderingContext2D, item: RadioInput): {element: ResolvedRadioElement; maxFontSize: number} {
        let width = 0;
        let maxFontSize = 0;
        const options: ResolvedRadioOption[] = item.options.map((option, i) => {
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, option.content);
            maxFontSize = Math.max(maxFontSize, labelFontSize);

            width += (i > 0 ? this.defaults.radioOptionGap : 0) + this.radioOptionContentWidth(labelWidth);

            return {
                key: option.key,
                selected: option.key === item.selected,
                labelRuns: measured,
                labelWidth,
                onSelect: item.onSelect,
                highlightStyle: this.fillHighlightStyle(option.highlightStyle ?? item.highlightStyle),
            };
        });
        return {element: {kind: "radio", options, width}, maxFontSize};
    }

    /** Resolves and measures a {@link CheckboxInput}'s label. */
    private resolveCheckbox(ctx: CanvasRenderingContext2D, item: CheckboxInput): {element: ResolvedCheckboxElement; maxFontSize: number} {
        const {runs: measured, width: labelWidth, maxFontSize} = this.resolveLine(ctx, item.content);
        const width = this.checkboxContentWidth(labelWidth);
        return {
            element: {
                kind: "checkbox",
                checked: item.checked,
                labelRuns: measured,
                labelWidth,
                onToggle: item.onToggle,
                highlightStyle: this.fillHighlightStyle(item.highlightStyle),
                width,
            },
            maxFontSize,
        };
    }

    /** Resolves a {@link NumberInput}. */
    private resolveNumber(item: NumberInput): {element: ResolvedNumberElement; maxFontSize: number} {
        return {
            element: {
                kind: "number",
                value: item.value,
                step: item.step ?? 1,
                allowDecimal: item.allowDecimal ?? false,
                onChange: item.onChange,
                highlightStyle: this.fillHighlightStyle(item.highlightStyle),
                width: this.defaults.numberInputWidth,
            },
            maxFontSize: this.defaults.fontSize,
        };
    }

    /** Resolves and measures a {@link SelectInput}'s options. */
    private resolveSelect(ctx: CanvasRenderingContext2D, item: SelectInput): {element: ResolvedSelectElement; maxFontSize: number} {
        let maxLabelWidth = 0;
        let maxFontSize = 0;
        const options: ResolvedSelectOption[] = item.options.map((option) => {
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, option.content);
            maxFontSize = Math.max(maxFontSize, labelFontSize);
            maxLabelWidth = Math.max(maxLabelWidth, labelWidth);
            return {
                key: option.key,
                labelRuns: measured,
                labelWidth,
                highlightStyle: this.fillHighlightStyle(option.highlightStyle ?? item.highlightStyle),
            };
        });

        const width = this.defaults.selectPadding * 2 + maxLabelWidth + this.defaults.selectArrowWidth;
        const selectedIndex = Math.max(0, options.findIndex((option) => option.key === item.selected));

        return {
            element: {
                kind: "select",
                options,
                selectedIndex,
                onSelect: item.onSelect,
                highlightStyle: this.fillHighlightStyle(item.highlightStyle),
                width,
            },
            maxFontSize,
        };
    }

    /** Resolves a bracket-wrapped button label's width under this display's plain font, and its highlight colours. */
    public resolveButton(ctx: CanvasRenderingContext2D, button: ButtonInput): ResolvedButtonElement {
        ctx.font = this.plainFont;
        const text = `[${button.label}]`;
        return {kind: "button", text, onClick: button.onClick, highlightStyle: this.fillHighlightStyle(button.highlightStyle), width: ctx.measureText(text).width};
    }

    /**
     * Resolves and measures an {@link Input} into its {@link
     * ResolvedInputElement}, dispatching on `kind`.
     */
    private resolveInput(ctx: CanvasRenderingContext2D, item: Input): {element: ResolvedInputElement; maxFontSize: number} {
        switch (item.kind) {
            case "radio":
                return this.resolveRadio(ctx, item);
            case "checkbox":
                return this.resolveCheckbox(ctx, item);
            case "number":
                return this.resolveNumber(item);
            case "button":
                return {element: this.resolveButton(ctx, item), maxFontSize: this.defaults.fontSize};
            case "select":
                return this.resolveSelect(ctx, item);
        }
    }

    /**
     * Resolves and measures every item in `line` - plain text segments
     * flatten to styled runs; inputs resolve via {@link resolveInput}. The
     * line's overall height is at least this display's minimum line height,
     * but grows to fit whichever element uses the largest font.
     */
    public resolveElements(ctx: CanvasRenderingContext2D, line: DisplayLine): ResolvedElementLine {
        let width = 0;
        let maxFontSize = 0;

        const elements: ResolvedElement[] = line.map((item): ResolvedElement => {
            if (isInput(item)) {
                const {element, maxFontSize: inputFontSize} = this.resolveInput(ctx, item);
                maxFontSize = Math.max(maxFontSize, inputFontSize);
                width += element.width;
                return element;
            }

            const {runs: measured, width: textWidth, maxFontSize: textFontSize} = this.resolveLine(ctx, [item]);
            maxFontSize = Math.max(maxFontSize, textFontSize);
            width += textWidth;
            return {kind: "text", runs: measured, width: textWidth};
        });

        return {elements, width, height: this.lineHeightFor(maxFontSize)};
    }

    /** Draws a checkbox's box (themed) plus a tick mark when `checked`. */
    private drawCheckboxBox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, checked: boolean): void {
        this.theme.drawBox(ctx, x, y, size, size, "sunken");

        if (checked) {
            ctx.strokeStyle = this.theme.boxForeground;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + size * 0.2, y + size * 0.55);
            ctx.lineTo(x + size * 0.42, y + size * 0.78);
            ctx.lineTo(x + size * 0.82, y + size * 0.22);
            ctx.stroke();
        }
    }

    /** Computes a resolved radio element's options' on-screen rects, walking left-to-right from `x`. */
    private layoutRadio(element: ResolvedRadioElement, x: number, y: number, height: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            focusables.push({rect: {x: elemX, y, w: optionWidth, h: height}, activate: () => option.onSelect(option.key)});
            elemX += optionWidth;
        });
        return focusables;
    }

    /** Draws a resolved radio element's marker circle plus label per option, walking left-to-right from `x`. */
    private paintRadio(ctx: CanvasRenderingContext2D, element: ResolvedRadioElement, x: number, y: number, height: number, focusedRect: Rect | null): void {
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            const rect: Rect = {x: elemX, y, w: optionWidth, h: height};
            const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

            if (focused) {
                ctx.fillStyle = option.highlightStyle.background;
                ctx.fillRect(elemX, y, optionWidth, this.defaults.fontSize);
            }

            const markerRadius = this.defaults.radioMarkerSize / 2;
            this.theme.drawRadioMarker(ctx, elemX + markerRadius, y + this.defaults.fontSize / 2, markerRadius, option.selected);

            const labelX = elemX + this.defaults.radioMarkerSize + this.defaults.radioMarkerGap;
            this.drawLine(ctx, option.labelRuns, labelX, y, height, focused ? option.highlightStyle.foreground : undefined);

            elemX += optionWidth;
        });
    }

    /** Computes a resolved checkbox element's on-screen rect. It activates by invoking `onToggle` with its flipped checked state. */
    private layoutCheckbox(element: ResolvedCheckboxElement, x: number, y: number, height: number): FocusableElement[] {
        return [{rect: {x, y, w: element.width, h: height}, activate: () => element.onToggle(!element.checked)}];
    }

    /** Draws a resolved checkbox element's box plus label at `x`. */
    private paintCheckbox(ctx: CanvasRenderingContext2D, element: ResolvedCheckboxElement, x: number, y: number, height: number, focusedRect: Rect | null): void {
        const rect: Rect = {x, y, w: element.width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

        if (focused) {
            ctx.fillStyle = element.highlightStyle.background;
            ctx.fillRect(x, y, element.width, this.defaults.fontSize);
        }

        const boxY = y + (this.defaults.fontSize - this.defaults.checkboxSize) / 2;
        this.drawCheckboxBox(ctx, x, boxY, this.defaults.checkboxSize, element.checked);

        const labelX = x + this.defaults.checkboxSize + this.defaults.checkboxGap;
        this.drawLine(ctx, element.labelRuns, labelX, y, height, focused ? element.highlightStyle.foreground : undefined);
    }

    /** Computes a resolved number element's on-screen rect. */
    private layoutNumber(element: ResolvedNumberElement, x: number, y: number, height: number): FocusableElement[] {
        return [{
            rect: {x, y, w: element.width, h: height},
            activate: () => undefined,
            numberEdit: {getValue: () => element.value, step: element.step, allowDecimal: element.allowDecimal, onChange: element.onChange},
        }];
    }

    /** Whether a blinking edit cursor should currently be drawn, per this display's cursor-blink interval. */
    private isCursorBlinkVisible(): boolean {
        return Math.floor(Date.now() / this.defaults.cursorBlinkIntervalMs) % 2 === 0;
    }

    /** Draws a resolved number element's box at `x`. */
    private paintNumber(ctx: CanvasRenderingContext2D, element: ResolvedNumberElement, x: number, y: number, height: number, focusedRect: Rect | null, editText: string | null): void {
        const rect: Rect = {x, y, w: element.width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

        const boxHeight = this.defaults.lineHeight - 4;
        const boxY = y + (this.defaults.fontSize - boxHeight) / 2;

        if (focused) {
            const pad = this.defaults.focusHighlightPadding;
            ctx.fillStyle = element.highlightStyle.background;
            ctx.fillRect(x - pad, boxY - pad, element.width + pad * 2, boxHeight + pad * 2);
        }

        this.theme.drawBox(ctx, x, boxY, element.width, boxHeight, "sunken");

        const editing = focused && editText !== null;
        const text = focused && editText !== null ? editText : String(element.value);
        ctx.font = this.plainFont;
        ctx.fillStyle = this.theme.boxForeground;
        const textX = x + this.defaults.numberInputPadding;
        const textY = y;
        ctx.fillText(text, textX, textY);

        if (editing && this.isCursorBlinkVisible()) {
            const textWidth = ctx.measureText(text).width;
            ctx.fillRect(textX + textWidth + 1, boxY + 2, 1, boxHeight - 4);
        }
    }

    /** Computes a resolved button's on-screen rect: its measured width, padded out by 2 canvas pixels on every side. */
    public layoutButton(element: ResolvedButtonElement, x: number, y: number, height: number): FocusableElement[] {
        return [{rect: {x: x - 2, y: y - 2, w: element.width + 4, h: height}, activate: element.onClick}];
    }

    /** Draws a resolved button's bracket-wrapped label at `(x, y)`, highlighted when `focusedRect` matches its rect. */
    private paintButton(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, height: number, focusedRect: Rect | null): void {
        const rect: Rect = {x: x - 2, y: y - 2, w: element.width + 4, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

        if (focused) {
            ctx.fillStyle = element.highlightStyle.background;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        ctx.font = this.plainFont;
        ctx.fillStyle = focused ? element.highlightStyle.foreground : this.defaults.foreground;
        ctx.fillText(element.text, x, y);
    }

    /**
     * Draws a resolved button standing on its own (e.g. a popup's footer
     * button row), reading this display's own focus state.
     */
    public drawButton(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, height: number): void {
        this.paintButton(ctx, element, x, y, height, this.getFocusedRect());
    }

    /** Computes a resolved select element's on-screen rect. It opens via {@link handleKeyDown}/clicking, not `activate`. */
    private layoutSelect(element: ResolvedSelectElement, x: number, y: number, height: number): FocusableElement[] {
        return [{
            rect: {x, y, w: element.width, h: height},
            activate: () => undefined,
            selectEdit: {
                options: element.options,
                selectedKey: element.options[element.selectedIndex]?.key ?? "",
                onSelect: element.onSelect,
            },
        }];
    }

    /** Draws a resolved select element's closed combo box at `x`: a themed box showing the selected option's label, plus a dropdown-arrow button. */
    private paintSelect(ctx: CanvasRenderingContext2D, element: ResolvedSelectElement, x: number, y: number, height: number, focusedRect: Rect | null, open: boolean): void {
        const rect: Rect = {x, y, w: element.width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect);

        const boxHeight = this.defaults.lineHeight - 4;
        const boxY = y + (this.defaults.fontSize - boxHeight) / 2;
        const arrowWidth = this.defaults.selectArrowWidth;
        const textBoxWidth = element.width - arrowWidth;

        if (focused) {
            const pad = this.defaults.focusHighlightPadding;
            ctx.fillStyle = element.highlightStyle.background;
            ctx.fillRect(x - pad, boxY - pad, element.width + pad * 2, boxHeight + pad * 2);
        }

        this.theme.drawBox(ctx, x, boxY, textBoxWidth, boxHeight, "sunken");

        const selected = element.options[element.selectedIndex];
        if (selected) {
            this.drawLine(ctx, selected.labelRuns, x + this.defaults.selectPadding, y, height);
        }

        this.theme.drawSelectArrowButton(ctx, x + textBoxWidth, boxY, arrowWidth, boxHeight, open);
    }

    /**
     * Draws a select input's open dropdown list below `boxRect`, on top of
     * whatever's underneath, highlighting `highlightIndex`'s row.
     *
     * @returns Each option row's on-screen rect, top to bottom, for hit-testing clicks.
     */
    private paintSelectDropdownRows(ctx: CanvasRenderingContext2D, selectEdit: SelectEditHandle, boxRect: Rect, highlightIndex: number): Rect[] {
        const rowHeight = this.defaults.lineHeight;
        const listHeight = rowHeight * selectEdit.options.length;
        const listRect: Rect = {x: boxRect.x, y: boxRect.y + boxRect.h, w: boxRect.w, h: listHeight};

        this.theme.drawBox(ctx, listRect.x, listRect.y, listRect.w, listRect.h, "sunken");

        return selectEdit.options.map((option, i) => {
            const rowRect: Rect = {x: listRect.x, y: listRect.y + i * rowHeight, w: listRect.w, h: rowHeight};
            const highlighted = i === highlightIndex;

            if (highlighted) {
                ctx.fillStyle = option.highlightStyle.background;
                ctx.fillRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h);
            }

            const textY = rowRect.y + (rowHeight - this.defaults.fontSize) / 2;
            this.drawLine(ctx, option.labelRuns, rowRect.x + this.defaults.selectPadding, textY, rowHeight, highlighted ? option.highlightStyle.foreground : undefined);
            return rowRect;
        });
    }

    /**
     * Draws the currently-open select input's dropdown, if any - must be
     * called after everything else, so it paints on top. A no-op if no
     * select is open.
     */
    public drawOpenSelectDropdown(ctx: CanvasRenderingContext2D): void {
        if (this.openSelectCursor === null) {
            this.openSelectDropdownRects = null;
            return;
        }
        const selectEdit = this.focusables[this.openSelectCursor]?.selectEdit;
        if (!selectEdit) {
            this.openSelectDropdownRects = null;
            return;
        }
        this.openSelectDropdownRects = this.paintSelectDropdownRows(ctx, selectEdit, this.focusables[this.openSelectCursor].rect, this.openSelectHighlight);
    }

    /** Computes a resolved input element's focusable rects, dispatching on `kind`. */
    private layoutInput(element: ResolvedInputElement, x: number, y: number, height: number): FocusableElement[] {
        switch (element.kind) {
            case "radio":
                return this.layoutRadio(element, x, y, height);
            case "checkbox":
                return this.layoutCheckbox(element, x, y, height);
            case "number":
                return this.layoutNumber(element, x, y, height);
            case "button":
                return this.layoutButton(element, x, y, height);
            case "select":
                return this.layoutSelect(element, x, y, height);
        }
    }

    /** Draws a resolved input element, dispatching on `kind`. */
    private paintInput(
        ctx: CanvasRenderingContext2D,
        element: ResolvedInputElement,
        x: number,
        y: number,
        height: number,
        focusedRect: Rect | null,
        editText: string | null,
        openRect: Rect | null,
    ): void {
        switch (element.kind) {
            case "radio":
                this.paintRadio(ctx, element, x, y, height, focusedRect);
                break;
            case "checkbox":
                this.paintCheckbox(ctx, element, x, y, height, focusedRect);
                break;
            case "number":
                this.paintNumber(ctx, element, x, y, height, focusedRect, editText);
                break;
            case "button":
                this.paintButton(ctx, element, x, y, height, focusedRect);
                break;
            case "select":
                this.paintSelect(ctx, element, x, y, height, focusedRect, openRect !== null && rectsEqual({x, y, w: element.width, h: height}, openRect));
                break;
        }
    }

    /**
     * Computes one resolved line's input focusable rects, walking
     * left-to-right from `x`, exactly as {@link drawElements} draws them.
     */
    public layoutFocusables(line: ResolvedElementLine, x: number, y: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        let elemX = x;
        for (const element of line.elements) {
            if (element.kind !== "text") {
                focusables.push(...this.layoutInput(element, elemX, y, line.height));
            }
            elemX += element.width;
        }
        return focusables;
    }

    /**
     * Draws a resolved line's elements left-to-right from `x`: plain text
     * runs as-is, inputs via {@link paintInput} - reading this display's own
     * focus/edit/open-dropdown state.
     */
    public drawElements(ctx: CanvasRenderingContext2D, line: ResolvedElementLine, x: number, y: number): void {
        const focusedRect = this.getFocusedRect();
        const editText = this.getEditText();
        const openRect = this.getOpenRect();

        let elemX = x;
        for (const element of line.elements) {
            if (element.kind === "text") {
                this.drawLine(ctx, element.runs, elemX, y, line.height);
            } else {
                this.paintInput(ctx, element, elemX, y, line.height, focusedRect, editText, openRect);
            }
            elemX += element.width;
        }
    }

    /**
     * Replaces the full set of focusable elements this frame - every input
     * across every line, plus any standalone buttons (e.g. a popup's footer
     * row), sorted into the order the cursor should navigate them in
     * (top-down, then left-to-right). Clamps the cursor and clears any
     * stale open-select/editing-number state that no longer matches.
     *
     * @param focusables - Every focusable element, pre-sorted by the caller.
     */
    public setFocusables(focusables: FocusableElement[]): void {
        this.focusables = focusables;

        if (this.cursor !== null && this.cursor >= this.focusables.length) {
            this.setCursor(this.focusables.length > 0 ? this.focusables.length - 1 : null);
        }
        if (this.openSelectCursor !== null && (this.openSelectCursor !== this.cursor || !this.focusables[this.openSelectCursor]?.selectEdit)) {
            this.openSelectCursor = null;
        }
        if (this.editingNumberCursor !== null && (this.editingNumberCursor !== this.cursor || !this.focusables[this.editingNumberCursor]?.numberEdit)) {
            this.editingNumberCursor = null;
            this.numberEditBuffer = null;
        }
    }

    /** The currently focused element's rect, if any. */
    private getFocusedRect(): Rect | null {
        return this.cursor !== null ? this.focusables[this.cursor]?.rect ?? null : null;
    }

    /** The focused number input's in-progress edit text, if it's the one currently being edited. */
    private getEditText(): string | null {
        return this.cursor !== null && this.numberEditBuffer?.cursor === this.cursor ? this.numberEditBuffer.text : null;
    }

    /** The open select input's box rect, if a dropdown is currently open. */
    private getOpenRect(): Rect | null {
        return this.openSelectCursor !== null ? this.focusables[this.openSelectCursor]?.rect ?? null : null;
    }

    /**
     * Moves the cursor one step through {@link focusables} in their sorted
     * order, treating "nothing selected" (`null`) as one extra stop between
     * the last element and the first.
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
        this.openSelectCursor = null;
        this.editingNumberCursor = null;
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
     * Enters edit mode for the number input at `cursor` (see {@link
     * editingNumberCursor}), seeding {@link numberEditBuffer} with
     * `initialText` - callers work out what that should be for the key (or
     * click) that triggered it: `value`'s current string for `Enter`/
     * `Space`/a click, the typed digit alone for a digit key, or `value`'s
     * string with its last character dropped for `Backspace`.
     *
     * @param cursor - Index of the number input within {@link focusables}.
     * @param numberEdit - The number input's edit handle.
     * @param initialText - The buffer's starting text.
     */
    private startEditingNumber(cursor: number, numberEdit: NumberEditHandle, initialText: string): void {
        this.editingNumberCursor = cursor;
        this.numberEditBuffer = {cursor, text: initialText};
    }

    /**
     * Handles a key press while a number input is in edit mode (see {@link
     * editingNumberCursor}).
     *
     * Digits (and `.`, if `numberEdit.allowDecimal`) append to {@link
     * numberEditBuffer} without touching `value`; `Backspace` removes the
     * buffer's last character the same way. `ArrowUp`/`ArrowDown` step
     * {@link getEffectiveNumberValue} by `numberEdit.step`, committing
     * immediately and refreshing the buffer to match, staying in edit mode.
     * `Enter`/`Space` commit the buffer (via {@link commitPendingNumberEdit})
     * and leave edit mode. `Escape` discards the buffer without committing
     * and leaves edit mode, reverting to `value`. Every other key is
     * ignored.
     *
     * @param cursor - Index of the focused number input within {@link focusables}.
     * @param numberEdit - The focused number input's edit handle.
     * @param event - The keyboard event.
     */
    private handleNumberInputKey(cursor: number, numberEdit: NumberEditHandle, event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.numberEditBuffer = null;
            this.editingNumberCursor = null;
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            this.commitPendingNumberEdit();
            this.editingNumberCursor = null;
            return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const delta = event.key === "ArrowUp" ? numberEdit.step : -numberEdit.step;
            const next = this.getEffectiveNumberValue(cursor, numberEdit) + delta;
            numberEdit.onChange(next);
            this.numberEditBuffer = {cursor, text: String(next)};
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
     * Handles a key press while a select input's dropdown is open.
     * `ArrowUp`/`ArrowDown` move {@link openSelectHighlight} within
     * `selectEdit.options` (clamped, no wrap); `ArrowLeft`/`ArrowRight` do
     * nothing; `Enter`/`Space` commit the highlighted option via
     * `selectEdit.onSelect` and close the dropdown; `Escape` closes it
     * without committing, leaving `selected` unchanged. Every other key is
     * ignored - all are swallowed regardless, since {@link handleKeyDown}
     * already calls `preventDefault`/`stopPropagation` up front.
     *
     * @param selectEdit - The open select input's edit handle.
     * @param event - The keyboard event.
     */
    private handleSelectInputKey(selectEdit: SelectEditHandle, event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.openSelectCursor = null;
        } else if (event.key === "ArrowUp") {
            this.openSelectHighlight = Math.max(0, this.openSelectHighlight - 1);
        } else if (event.key === "ArrowDown") {
            this.openSelectHighlight = Math.min(selectEdit.options.length - 1, this.openSelectHighlight + 1);
        } else if (event.key === "Enter" || event.key === " ") {
            selectEdit.onSelect(selectEdit.options[this.openSelectHighlight].key);
            this.openSelectCursor = null;
        }
    }

    /**
     * While focused, intercepts every key press before any other
     * key-driven controller sees it. A select-dropdown-open/number-editing
     * cursor routes every key there first, taking priority even over
     * {@link keyDownInterceptor}. Otherwise, the interceptor runs next (e.g.
     * a popup's close keys); if it doesn't handle the key,
     * `ArrowLeft`/`ArrowRight` move the cursor between {@link focusables} in
     * their sorted order, `ArrowUp`/`ArrowDown` move it to the closest
     * element in the row above/below (see {@link moveCursorVertical}), and
     * `Enter`/`Space` activates whichever one the cursor is currently on (if
     * any) - or, for a select input, opens its dropdown, or for a number
     * input, enters edit mode. Typing a digit or `Backspace` while a number
     * input is focused (but not yet editing) also enters edit mode.
     *
     * @param event - The keyboard event.
     */
    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.isFocused()) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        const cursor = this.cursor;

        if (cursor !== null && this.openSelectCursor === cursor) {
            const selectEdit = this.focusables[cursor].selectEdit;
            if (selectEdit) {
                this.handleSelectInputKey(selectEdit, event);
                return;
            }
        }

        if (cursor !== null && this.editingNumberCursor === cursor) {
            const numberEdit = this.focusables[cursor].numberEdit;
            if (numberEdit) {
                this.handleNumberInputKey(cursor, numberEdit, event);
                return;
            }
        }

        if (this.keyDownInterceptor?.(event)) {
            return;
        }
        if (this.focusables.length === 0) {
            return;
        }

        const focusedNumberEdit = cursor !== null ? this.focusables[cursor].numberEdit : undefined;

        if (event.key === "ArrowLeft") {
            this.moveCursorHorizontal(-1);
        } else if (event.key === "ArrowRight") {
            this.moveCursorHorizontal(1);
        } else if (event.key === "ArrowUp") {
            this.moveCursorVertical(-1);
        } else if (event.key === "ArrowDown") {
            this.moveCursorVertical(1);
        } else if (cursor !== null && focusedNumberEdit && /^[0-9]$/.test(event.key)) {
            this.startEditingNumber(cursor, focusedNumberEdit, event.key);
        } else if (cursor !== null && focusedNumberEdit && event.key === "Backspace") {
            this.startEditingNumber(cursor, focusedNumberEdit, String(focusedNumberEdit.getValue()).slice(0, -1));
        } else if ((event.key === "Enter" || event.key === " ") && this.cursor !== null) {
            const focusable = this.focusables[this.cursor];
            const selectEdit = focusable.selectEdit;
            const numberEdit = focusable.numberEdit;
            if (selectEdit) {
                this.openSelectCursor = this.cursor;
                this.openSelectHighlight = Math.max(0, selectEdit.options.findIndex((option) => option.key === selectEdit.selectedKey));
            } else if (numberEdit) {
                this.startEditingNumber(this.cursor, numberEdit, String(numberEdit.getValue()));
            } else {
                focusable.activate();
            }
        }
    };

    /**
     * While active, swallows a `mousedown` before it reaches anything
     * behind this display (e.g. {@link CameraDragController}'s canvas
     * listener) whenever it's already focused, or (in `"click"` mode) about
     * to become focused by this same click landing inside {@link bounds}.
     *
     * @param event - The mouse event.
     */
    private readonly handleMouseDown = (event: MouseEvent): void => {
        if (!this.active) {
            return;
        }
        if (this.isFocused()) {
            event.stopPropagation();
            return;
        }
        if (this.focusMode === "click" && this.bounds && pointInRect(event.clientX, event.clientY, this.bounds)) {
            event.stopPropagation();
        }
    };

    /**
     * While active: in `"click"` focus mode, a click outside {@link bounds}
     * blurs this display (if focused) and falls through unswallowed, so
     * whatever's beneath still receives it; a click inside `bounds` while
     * unfocused grants focus, then falls through to the same hit-testing a
     * focused click gets. Once focused (in either mode), hit-tests the
     * click against {@link focusables} (as last laid out): a hit moves the
     * cursor to that element and activates it, same as pressing `Enter`
     * while it's focused - or, for a select input, opens its dropdown, or
     * for a number input not already being edited, enters edit mode. While
     * a select's dropdown is open, a click is tested against {@link
     * openSelectDropdownRects} first: a hit on an option row commits it and
     * closes, a hit on the select's own box closes it without committing
     * (toggling it shut), and a hit elsewhere just closes the dropdown
     * before falling through to the normal hit-test below. Registered on
     * the capture phase and stops propagation while focused, for the same
     * reason as {@link handleMouseDown}.
     *
     * @param event - The mouse event.
     */
    private readonly handleClick = (event: MouseEvent): void => {
        if (!this.active) {
            return;
        }

        if (this.focusMode === "click" && this.bounds && !pointInRect(event.clientX, event.clientY, this.bounds)) {
            this.focused = false;
            return;
        }

        if (!this.isFocused()) {
            if (this.focusMode !== "click") {
                return;
            }
            this.focused = true;
        }

        event.stopPropagation();

        if (this.openSelectCursor !== null && this.openSelectDropdownRects) {
            const optionIndex = this.openSelectDropdownRects.findIndex((rect) => pointInRect(event.clientX, event.clientY, rect));
            const selectEdit = this.focusables[this.openSelectCursor].selectEdit;
            if (optionIndex !== -1 && selectEdit) {
                selectEdit.onSelect(selectEdit.options[optionIndex].key);
            }
            const openBoxRect = this.focusables[this.openSelectCursor].rect;
            this.openSelectCursor = null;
            if (optionIndex !== -1 || pointInRect(event.clientX, event.clientY, openBoxRect)) {
                return;
            }
        }

        const index = this.focusables.findIndex((focusable) => pointInRect(event.clientX, event.clientY, focusable.rect));
        if (index === -1) {
            return;
        }
        this.setCursor(index);
        const focusable = this.focusables[index];
        const selectEdit = focusable.selectEdit;
        const numberEdit = focusable.numberEdit;
        if (selectEdit) {
            this.openSelectCursor = index;
            this.openSelectHighlight = Math.max(0, selectEdit.options.findIndex((option) => option.key === selectEdit.selectedKey));
        } else if (numberEdit) {
            if (this.editingNumberCursor !== index) {
                this.startEditingNumber(index, numberEdit, String(numberEdit.getValue()));
            }
        } else {
            focusable.activate();
        }
    };
}
