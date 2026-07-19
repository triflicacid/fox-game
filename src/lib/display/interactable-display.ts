import {DEFAULT_DISPLAY_DEFAULTS, Display, DisplayDefaults, MeasuredRun} from "./display";
import {ButtonInput, CheckboxInput, DisplayLine, DisplayLineItem, Input, NumberInput, RadioInput, SelectInput, TextBoxInputBase, TextInput} from "./input";
import {ChromeTheme} from "./chrome-theme";
import {ResolvedStateStyle, resolveStateStyle} from "./state-style";
import {Alignment, TextSegment, TextStyle} from "./text-style";
import {BoundingRect, pointInRect, rectsEqual, unionRect} from "./bounding-rect";
import {copyToClipboard, readFromClipboard} from "../../util";

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
    /** Padding added around a number/textbox's sunken box when drawing its `focusedStyle` background - kept outside the box, unlike `editingStyle`/`selectedStyle`, which paint inside it. */
    focusHighlightPadding: number;
    /** Fill colour of the sheen painted over a disabled input to grey it out - its whole box for a number/select input, or just the marker/box for a radio option/checkbox. Buttons have no box to grey out - a disabled one just stops highlighting/activating. */
    disabledOverlayColor: string;
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
    /** Largest font size used in the label, in canvas pixels - for vertically centering the marker/highlight against the label as actually drawn. */
    fontSize: number;
    /** This option's own vertical alignment within the radio's bounding box, independent of other options. */
    align: Alignment;
    onSelect: (key: string) => void;
    focusedStyle: ResolvedStateStyle;
    /** Style while this is the selected option, or `null` for none. */
    selectedStyle: ResolvedStateStyle | null;
    /** Marker-only style while selected - already folds in the `selectedStyle` fallback. */
    inputSelectedStyle: ResolvedStateStyle;
    /** Marker-only style at rest - already folds in the input's base `style` fallback. */
    inputStyle: ResolvedStateStyle;
    /** Whether this option is disabled - true if the option itself is, or the owning {@link RadioInput} as a whole is. */
    disabled: boolean;
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
    /** Largest font size used in the label, in canvas pixels - for vertically centering the box/highlight against the label as actually drawn. */
    fontSize: number;
    onToggle: (checked: boolean) => void;
    focusedStyle: ResolvedStateStyle;
    /** Style while checked, or `null` for none. */
    selectedStyle: ResolvedStateStyle | null;
    /** Box-only style while checked - already folds in the `selectedStyle` fallback. */
    inputSelectedStyle: ResolvedStateStyle;
    /** Box-only style at rest - already folds in the input's base `style` fallback. */
    inputStyle: ResolvedStateStyle;
    disabled: boolean;
    width: number;
}

/** A resolved, measured number input within a line. */
interface ResolvedNumberElement {
    kind: "number";
    value: number;
    step: number;
    allowDecimal: boolean;
    onChange: (value: number) => void;
    focusedStyle: ResolvedStateStyle;
    /** Style overlaid while the box is being edited. */
    editingStyle: ResolvedStateStyle;
    /** Style a Shift+Arrow text selection is drawn with. */
    selectionStyle: ResolvedStateStyle;
    /** Canvas font string for the box's own text - reflects `style`, and `editingStyle`/`focusedStyle` while active, per {@link InteractableDisplay.resolveTextBoxCommon}. */
    font: string;
    /** Font size backing `font`, in canvas pixels - for sizing the box/caret around the text as actually drawn. */
    fontSize: number;
    disabled: boolean;
    width: number;
}

/** A resolved, measured textbox input within a line. */
interface ResolvedTextboxElement {
    kind: "textbox";
    value: string;
    allowedChars: string[] | null;
    disallowedChars: string[] | null;
    onChange: (value: string) => boolean;
    focusedStyle: ResolvedStateStyle;
    /** Style overlaid while the box is being edited. */
    editingStyle: ResolvedStateStyle;
    /** Style a Shift+Arrow text selection is drawn with. */
    selectionStyle: ResolvedStateStyle;
    /** Canvas font string for the box's own text - reflects `style`, and `editingStyle`/`focusedStyle` while active, per {@link InteractableDisplay.resolveTextBoxCommon}. */
    font: string;
    /** Font size backing `font`, in canvas pixels - for sizing the box/caret around the text as actually drawn. */
    fontSize: number;
    disabled: boolean;
    width: number;
}

/** A resolved, measured button - "[Label]". */
export interface ResolvedButtonElement {
    kind: "button";
    text: string;
    onClick: () => void;
    focusedStyle: ResolvedStateStyle;
    /** Canvas font string for the label - reflects `style`, and `focusedStyle` while focused, per {@link InteractableDisplay.resolveButton}. */
    font: string;
    disabled: boolean;
    width: number;
}

/** A single resolved, measured option within a resolved select input. */
interface ResolvedSelectOption {
    key: string;
    labelRuns: MeasuredRun[];
    labelWidth: number;
    /** Largest font size used in this option's label, in canvas pixels - for vertically centering its dropdown row against the label as actually drawn. */
    fontSize: number;
    focusedStyle: ResolvedStateStyle;
    /** Style while this is the selected option, or `null` for none. */
    selectedStyle: ResolvedStateStyle | null;
    /** Whether this option alone is disabled: unselectable and skipped by Arrow navigation, independent of the owning {@link SelectInput}. */
    disabled: boolean;
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
    focusedStyle: ResolvedStateStyle;
    /** Style overlaid on the closed box while its dropdown is open. Falls back to `focusedStyle`, so the box still highlights on open even unset. */
    expandedStyle: ResolvedStateStyle;
    /** Ambient style for every dropdown row while open - the user's own `expandedStyle`, with no fallback to `focusedStyle` (unset means no ambient colouring, just the theme's plain row look). */
    rowAmbientStyle: ResolvedStateStyle;
    /** Largest font size used by any option's label, in canvas pixels - sizes every dropdown row uniformly tall enough for whichever option needs the most room. */
    rowFontSize: number;
    /** The closed box's own label runs - resolved independently of `options[selectedIndex].labelRuns` so a dropdown highlight never affects it. Sized/formatted by `selectedStyle` only. */
    closedBoxLabelRuns: MeasuredRun[];
    /** Font size backing `closedBoxLabelRuns`, in canvas pixels - for sizing the closed box around it. */
    closedBoxFontSize: number;
    disabled: boolean;
    width: number;
}

/** Every kind of resolved, measured input element a line can contain - mirrors {@link Input}. */
type ResolvedInputElement = ResolvedRadioElement | ResolvedCheckboxElement | ResolvedNumberElement | ResolvedTextboxElement | ResolvedButtonElement | ResolvedSelectElement;

/** A line item's own font size and requested vertical alignment - attached uniformly in {@link InteractableDisplay.resolveElements}, not by each individual `resolve*`. */
interface LineItemMeta {
    fontSize: number;
    align: Alignment;
}

type ResolvedElement = (ResolvedTextElement | ResolvedInputElement) & LineItemMeta;

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

/** Config to support editing for a {@link ResolvedTextboxElement}. */
interface TextEditHandle {
    getValue: () => string;
    allowedChars: string[] | null;
    disallowedChars: string[] | null;
    onChange: (value: string) => boolean;
}

/** Config to support opening/navigating a {@link ResolvedSelectElement}. */
interface SelectEditHandle {
    options: ResolvedSelectOption[];
    selectedKey: string;
    onSelect: (key: string) => void;
    /** Ambient style for the dropdown's rows while open, overridden per-row by a highlighted/selected option's own style - the user's own `expandedStyle` with no fallback, so unset means no ambient colouring (not the theme's focus look). */
    rowAmbientStyle: ResolvedStateStyle;
    /** Row height every dropdown row uses, tall enough for whichever option's label needs the most room. */
    rowHeight: number;
    /** The closed box's own visual rect - the dropdown anchors directly beneath this, not the coarser line-height focusable rect. */
    boxRect: BoundingRect;
}

/** Anything an {@link InteractableDisplay}'s keyboard cursor can land on and activate. */
export interface FocusableElement {
    rect: BoundingRect;
    activate: () => void;
    /** Present only for number-input focusables - see {@link InteractableDisplay.handleNumberInputKey}. */
    numberEdit?: NumberEditHandle;
    /** Present only for textbox focusables - see {@link InteractableDisplay.handleTextboxInputKey}. */
    textEdit?: TextEditHandle;
    /** Present only for select-input focusables - see {@link InteractableDisplay.handleSelectInputKey}. */
    selectEdit?: SelectEditHandle;
    /** Whether this element is disabled - skipped by arrow-key navigation and unclickable/unactivatable. It can still be the current cursor position (e.g. if it became disabled while focused), just not drawn highlighted. */
    disabled: boolean;
}

/**
 * `KeyboardEvent.key` values for pure modifier keys.
 */
const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock"]);

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
    disabledOverlayColor: "rgba(128, 128, 128, 0.5)",
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
    private bounds: BoundingRect | null = null;
    private keyDownInterceptor: ((event: KeyboardEvent) => boolean) | undefined;
    private readonly initialFocusIndex: number | null;

    private focusables: FocusableElement[] = [];
    /** Memoised {@link getBounds} result - `undefined` means not yet computed since the last {@link setFocusables} call. */
    private cachedBounds: BoundingRect | null | undefined = undefined;
    private cursor: number | null = null;
    /** The in-progress typed text (plus caret position within it) for whichever number input is being edited, if any. `anchor` is the fixed end of an in-progress Shift+Arrow selection (`null` when there's no selection), with `pos` as its moving end. */
    private numberEditBuffer: {cursor: number; text: string; pos: number; anchor: number | null} | null = null;
    /** Index into {@link focusables} of the number input currently in edit mode, if any. */
    private editingNumberCursor: number | null = null;
    /** The in-progress typed text (plus caret position within it) for whichever textbox is being edited, if any - kept in lockstep with {@link editingTextCursor}. `anchor` is the fixed end of an in-progress Shift+Arrow selection (`null` when there's no selection), with `pos` as its moving end. */
    private textEditBuffer: {cursor: number; text: string; pos: number; anchor: number | null} | null = null;
    /** Index into {@link focusables} of the textbox currently in edit mode, if any. */
    private editingTextCursor: number | null = null;
    /** Index into {@link focusables} of the select input whose dropdown is currently open, if any. */
    private openSelectCursor: number | null = null;
    /** Index into the open select's `options` currently highlighted, while a dropdown is open. */
    private openSelectHighlight = 0;
    /** The open select's option rows' on-screen rects, as last painted - for hit-testing clicks. */
    private openSelectDropdownRects: BoundingRect[] | null = null;
    /** Running per-slot index consumed during a resolve pass, mirroring {@link layoutFocusables}/{@link layoutButton}'s order - lets resolve* methods check last frame's focus/edit/open state (one frame stale). Reset via {@link beginResolvePass}. */
    private resolveFocusIndex = 0;

    /**
     * @param defaults - Default text style, minimum line height, and input geometry. Any field left unset falls back to {@link DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS}.
     * @param theme - Chrome (borders/boxes/markers) this display paints its inputs and panel with.
     * @param focusMode - Whether this display is always focused while active, or only once clicked into.
     * @param initialFocusIndex - Index into {@link focusables} the cursor lands on when {@link setActive} is called with `true`, or `null` for no initial focus. Defaults to `0` (the first element).
     */
    public constructor(defaults: Partial<InteractableDisplayDefaults>, theme: ChromeTheme, focusMode: FocusMode, initialFocusIndex: number | null = 0) {
        const resolved: InteractableDisplayDefaults = {...DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS, ...defaults};
        super(resolved);
        this.defaults = resolved;
        this.theme = theme;
        this.focusMode = focusMode;
        this.initialFocusIndex = initialFocusIndex;
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
            this.cursor = this.initialFocusIndex;
            this.numberEditBuffer = null;
            this.editingNumberCursor = null;
            this.textEditBuffer = null;
            this.editingTextCursor = null;
            this.openSelectCursor = null;
            this.openSelectHighlight = 0;
            this.focused = this.focusMode === "always";
        } else {
            this.commitPendingNumberEdit();
            this.commitPendingTextEdit();
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
    public setBounds(rect: BoundingRect | null): void {
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

    /** Resets {@link resolveFocusIndex} to `0` - call once per frame, before the first `resolve*` call. */
    public beginResolvePass(): void {
        this.resolveFocusIndex = 0;
    }

    /** Consumes and returns the next focusable-slot index. Every `resolve*` method must consume exactly as many as it has focusable slots (matching {@link layoutFocusables}/{@link layoutButton}), even unused, or the count drifts. */
    private nextResolveIndex(): number {
        return this.resolveFocusIndex++;
    }

    /** Whether `index` was the focused element as of last frame's layout (one frame stale - see {@link resolveFocusIndex}). */
    private wasFocusedIndex(index: number): boolean {
        return this.isFocused() && this.cursor === index;
    }

    /** Whether `index` was the number input being edited as of last frame. */
    private wasEditingNumberIndex(index: number): boolean {
        return this.editingNumberCursor === index;
    }

    /** Whether `index` was the textbox being edited as of last frame. */
    private wasEditingTextIndex(index: number): boolean {
        return this.editingTextCursor === index;
    }

    /** Whether `index` was the select input whose dropdown was open as of last frame. */
    private wasOpenIndex(index: number): boolean {
        return this.openSelectCursor === index;
    }

    /** Merges `styles` left-to-right (later fields win), skipping `undefined` entries. Returns `undefined` if nothing was merged, so callers can skip wrapping when there's nothing to apply. */
    private mergeStyle(...styles: (TextStyle | undefined)[]): TextStyle | undefined {
        const merged: TextStyle = {};
        for (const style of styles) {
            if (style !== undefined) {
                Object.assign(merged, style);
            }
        }
        return Object.keys(merged).length === 0 ? undefined : merged;
    }

    /** Wraps `content` in a synthetic parent segment carrying `style`, so its fields inherit into `content` via {@link Display.resolveLine}'s normal inheritance. Returns `content` unchanged when `style` is `undefined`. */
    private withAmbientStyle(content: TextSegment[], style: TextStyle | undefined): TextSegment[] {
        return style === undefined ? content : [{content, style}];
    }

    /** The theme's default focused style, as a resolved base for focus/editing/expansion styles. */
    private focusBase(): ResolvedStateStyle {
        const style = this.theme.defaultFocusedStyle();
        return {foreground: style.foreground, background: style.background};
    }

    /** The theme's default box/marker look, as a resolved base for `inputStyle`/`inputSelectedStyle` - concrete (never unset) so `invert` always has a colour pair to swap. */
    private boxBase(): ResolvedStateStyle {
        return {foreground: this.theme.boxForeground, background: this.theme.boxBackground};
    }

    /** Resolves an input-level then optional option-level style over `base`, per field. */
    private resolveLayeredStyle(inputStyle: TextStyle | undefined, base: ResolvedStateStyle, optionStyle?: TextStyle): ResolvedStateStyle {
        const input = resolveStateStyle(inputStyle, base);
        return optionStyle === undefined ? input : resolveStateStyle(optionStyle, input);
    }

    /** Resolves an input-level then optional option-level focused style over the theme's default focused style. */
    private resolveFocusedStyle(inputStyle: TextStyle | undefined, optionStyle?: TextStyle): ResolvedStateStyle {
        return this.resolveLayeredStyle(inputStyle, this.focusBase(), optionStyle);
    }

    /** Resolves a selected/checked style, or `null` when neither input nor option sets one so the marker/tick alone shows selection. */
    private resolveSelectedStyle(inputStyle: TextStyle | undefined, optionStyle?: TextStyle): ResolvedStateStyle | null {
        if (inputStyle === undefined && optionStyle === undefined) {
            return null;
        }
        return this.resolveLayeredStyle(inputStyle, {foreground: undefined, background: undefined}, optionStyle);
    }

    /** Resolves a checked/selected marker's own style: input-level then optional option-level `inputSelectedStyle`, falling back field-by-field to the already-resolved `selectedStyle`, then the theme's default box look - concrete, so `invert` always has something to swap. */
    private resolveInputSelectedStyle(inputStyle: TextStyle | undefined, selectedStyle: ResolvedStateStyle | null, optionStyle?: TextStyle): ResolvedStateStyle {
        const boxBase = this.boxBase();
        const base: ResolvedStateStyle = {
            foreground: selectedStyle?.foreground ?? boxBase.foreground,
            background: selectedStyle?.background ?? boxBase.background,
        };
        return this.resolveLayeredStyle(inputStyle, base, optionStyle);
    }

    /** Resolves a marker's own idle style: input-level then optional option-level `inputStyle`, falling back field-by-field to the resolved base `style`, then the theme's default box look. */
    private resolveInputStyle(inputStyle: TextStyle | undefined, baseStyle: TextStyle | undefined, optionStyle?: TextStyle): ResolvedStateStyle {
        return this.resolveLayeredStyle(inputStyle, resolveStateStyle(baseStyle, this.boxBase()), optionStyle);
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
     * first or after the last). A `hidden` option contributes nothing, as
     * if absent - it's excluded before gaps are counted, so it leaves no
     * gap behind either.
     */
    private resolveRadio(ctx: CanvasRenderingContext2D, item: RadioInput): {element: ResolvedRadioElement; maxFontSize: number} {
        let width = 0;
        let maxFontSize = 0;
        const options: ResolvedRadioOption[] = item.options.filter((option) => !option.hidden).map((option, i) => {
            const disabled = (item.disabled ?? false) || (option.disabled ?? false);
            const focused = this.wasFocusedIndex(this.nextResolveIndex()) && !disabled;
            const selected = option.key === item.selected;

            // Base `style` always applies; whichever state is active layers on
            // top, same precedence as the label's colour (focusedStyle > selectedStyle).
            const stateStyle = focused
                ? this.mergeStyle(item.focusedStyle, option.focusedStyle)
                : (selected ? this.mergeStyle(item.selectedStyle, option.selectedStyle) : undefined);
            const ambientStyle = this.mergeStyle(item.style, stateStyle);
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, this.withAmbientStyle(option.content, ambientStyle));
            maxFontSize = Math.max(maxFontSize, labelFontSize);

            width += (i > 0 ? this.defaults.radioOptionGap : 0) + this.radioOptionContentWidth(labelWidth);

            const selectedStyle = this.resolveSelectedStyle(item.selectedStyle, option.selectedStyle);

            return {
                key: option.key,
                selected,
                labelRuns: measured,
                labelWidth,
                fontSize: labelFontSize,
                align: option.align ?? "top",
                onSelect: item.onSelect,
                focusedStyle: this.resolveFocusedStyle(item.focusedStyle, option.focusedStyle),
                selectedStyle,
                inputSelectedStyle: this.resolveInputSelectedStyle(item.inputSelectedStyle, selectedStyle, option.inputSelectedStyle),
                inputStyle: this.resolveInputStyle(item.inputStyle, item.style, option.inputStyle),
                disabled,
            };
        });
        return {element: {kind: "radio", options, width}, maxFontSize};
    }

    /** Resolves and measures a {@link CheckboxInput}'s label. */
    private resolveCheckbox(ctx: CanvasRenderingContext2D, item: CheckboxInput): {element: ResolvedCheckboxElement; maxFontSize: number} {
        const disabled = item.disabled ?? false;
        const focused = this.wasFocusedIndex(this.nextResolveIndex()) && !disabled;

        // Base `style` always applies; whichever state is active layers on
        // top, same precedence as the label's colour (focusedStyle > selectedStyle).
        const stateStyle = focused ? item.focusedStyle : (item.checked ? item.selectedStyle : undefined);
        const ambientStyle = this.mergeStyle(item.style, stateStyle);
        const {runs: measured, width: labelWidth, maxFontSize} = this.resolveLine(ctx, this.withAmbientStyle(item.content, ambientStyle));
        const width = this.checkboxContentWidth(labelWidth);
        const selectedStyle = this.resolveSelectedStyle(item.selectedStyle);
        return {
            element: {
                kind: "checkbox",
                checked: item.checked,
                labelRuns: measured,
                labelWidth,
                fontSize: maxFontSize,
                onToggle: item.onToggle,
                focusedStyle: this.resolveFocusedStyle(item.focusedStyle),
                selectedStyle,
                inputSelectedStyle: this.resolveInputSelectedStyle(item.inputSelectedStyle, selectedStyle),
                inputStyle: this.resolveInputStyle(item.inputStyle, item.style),
                disabled,
                width,
            },
            maxFontSize,
        };
    }

    /**
     * Resolves the layout, styles, box width, and font shared by a number
     * input and textbox. `contentText` is measured when `maxWidth` is
     * `Infinity`. `wasFocused`/`wasEditing` pick which state style ambiently
     * sizes/formats the text, same precedence as its colour.
     */
    private resolveTextBoxCommon(ctx: CanvasRenderingContext2D, item: TextBoxInputBase, contentText: string, wasFocused: boolean, wasEditing: boolean): {focusedStyle: ResolvedStateStyle; editingStyle: ResolvedStateStyle; selectionStyle: ResolvedStateStyle; font: string; fontSize: number; disabled: boolean; width: number; maxFontSize: number} {
        const ambientStyle = this.mergeStyle(item.style, wasEditing ? item.editingStyle : (wasFocused ? item.focusedStyle : undefined));
        let font = this.plainFont;
        let maxFontSize = this.defaults.fontSize;
        let measuredWidth: number | undefined;
        if (ambientStyle !== undefined) {
            const resolved = this.resolveLine(ctx, [{content: contentText, style: ambientStyle}]);
            font = resolved.runs[0]?.run.font ?? this.plainFont;
            maxFontSize = resolved.maxFontSize;
            measuredWidth = resolved.width;
        }

        const maxWidth = item.maxWidth ?? this.defaults.numberInputWidth;
        let width: number;
        if (Number.isFinite(maxWidth)) {
            width = maxWidth;
        } else {
            // +3 leaves room for the blinking caret drawn just past the text
            // (see paintTextBox) - without it, a caret sitting at the very
            // end of the content would fall outside the box's clip rect.
            const contentWidth = (measuredWidth ?? this.measureTextWidth(ctx, contentText, this.plainFont)) + this.defaults.numberInputPadding * 2 + 3;
            width = Math.max(item.minWidth ?? 0, contentWidth);
        }
        const focusedStyle = this.resolveFocusedStyle(item.focusedStyle);
        return {
            focusedStyle,
            // No fallback to focusedStyle - unset editingStyle is a no-op.
            editingStyle: resolveStateStyle(item.editingStyle, {foreground: undefined, background: undefined}),
            selectionStyle: resolveStateStyle(item.selectedStyle, focusedStyle),
            font,
            fontSize: maxFontSize,
            disabled: item.disabled ?? false,
            width,
            maxFontSize,
        };
    }

    /** Resolves a {@link NumberInput}. */
    private resolveNumber(ctx: CanvasRenderingContext2D, item: NumberInput): {element: ResolvedNumberElement; maxFontSize: number} {
        const disabled = item.disabled ?? false;
        const focusIndex = this.nextResolveIndex();
        const wasFocused = this.wasFocusedIndex(focusIndex) && !disabled;
        const wasEditing = this.wasEditingNumberIndex(focusIndex) && !disabled;
        const {maxFontSize, ...common} = this.resolveTextBoxCommon(ctx, item, String(item.value), wasFocused, wasEditing);
        return {
            element: {
                kind: "number",
                value: item.value,
                step: item.step ?? 1,
                allowDecimal: item.allowDecimal ?? false,
                onChange: item.onChange,
                ...common,
            },
            maxFontSize,
        };
    }

    /** Resolves a {@link TextInput}. */
    private resolveTextbox(ctx: CanvasRenderingContext2D, item: TextInput): {element: ResolvedTextboxElement; maxFontSize: number} {
        const disabled = item.disabled ?? false;
        const focusIndex = this.nextResolveIndex();
        const wasFocused = this.wasFocusedIndex(focusIndex) && !disabled;
        const wasEditing = this.wasEditingTextIndex(focusIndex) && !disabled;
        const {maxFontSize, ...common} = this.resolveTextBoxCommon(ctx, item, item.value, wasFocused, wasEditing);
        return {
            element: {
                kind: "textbox",
                value: item.value,
                allowedChars: item.allowedChars ?? null,
                disallowedChars: item.disallowedChars ?? null,
                onChange: item.onChange,
                ...common,
            },
            maxFontSize,
        };
    }

    /**
     * Resolves and measures a {@link SelectInput}'s options. A `hidden`
     * option contributes nothing, as if absent.
     *
     * `selectedStyle`/`focusedStyle` (while highlighted in an open dropdown)
     * ambiently size/format a dropdown row, same precedence as their colour.
     * The closed box is resolved separately (`closedBoxLabelRuns`/
     * `closedBoxFontSize`, `selectedStyle` only), so a dropdown highlight
     * never affects it. `expandedStyle` stays colour-only.
     */
    private resolveSelect(ctx: CanvasRenderingContext2D, item: SelectInput): {element: ResolvedSelectElement; maxFontSize: number} {
        const wasOpen = this.wasOpenIndex(this.nextResolveIndex());

        let maxLabelWidth = 0;
        let maxFontSize = 0;
        const options: ResolvedSelectOption[] = item.options.filter((option) => !option.hidden).map((option, i) => {
            const selected = option.key === item.selected;
            const highlighted = wasOpen && i === this.openSelectHighlight && !(option.disabled ?? false);
            const stateStyle = highlighted
                ? this.mergeStyle(item.focusedStyle, option.focusedStyle)
                : (selected ? this.mergeStyle(item.selectedStyle, option.selectedStyle) : undefined);
            const ambientStyle = this.mergeStyle(item.style, stateStyle);
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, this.withAmbientStyle(option.content, ambientStyle));
            maxFontSize = Math.max(maxFontSize, labelFontSize);
            maxLabelWidth = Math.max(maxLabelWidth, labelWidth);
            return {
                key: option.key,
                labelRuns: measured,
                labelWidth,
                fontSize: labelFontSize,
                focusedStyle: this.resolveFocusedStyle(item.focusedStyle, option.focusedStyle),
                selectedStyle: this.resolveSelectedStyle(item.selectedStyle, option.selectedStyle),
                disabled: option.disabled ?? false,
            };
        });

        const width = this.defaults.selectPadding * 2 + maxLabelWidth + this.defaults.selectArrowWidth;
        const selectedIndex = Math.max(0, options.findIndex((option) => option.key === item.selected));
        const focusedStyle = this.resolveFocusedStyle(item.focusedStyle);

        // Independent of `options` above - never affected by a dropdown highlight.
        const selectedOption = item.options.find((option) => option.key === item.selected && !option.hidden);
        let closedBoxLabelRuns: MeasuredRun[] = [];
        let closedBoxFontSize = this.defaults.fontSize;
        if (selectedOption) {
            const closedBoxStateStyle = this.mergeStyle(item.selectedStyle, selectedOption.selectedStyle);
            const closedBoxAmbientStyle = this.mergeStyle(item.style, closedBoxStateStyle);
            const resolved = this.resolveLine(ctx, this.withAmbientStyle(selectedOption.content, closedBoxAmbientStyle));
            closedBoxLabelRuns = resolved.runs;
            closedBoxFontSize = resolved.maxFontSize;
        }

        return {
            element: {
                kind: "select",
                options,
                selectedIndex,
                onSelect: item.onSelect,
                focusedStyle,
                expandedStyle: resolveStateStyle(item.expandedStyle, focusedStyle),
                rowAmbientStyle: resolveStateStyle(item.expandedStyle, {foreground: undefined, background: undefined}),
                rowFontSize: maxFontSize,
                closedBoxLabelRuns,
                closedBoxFontSize,
                disabled: item.disabled ?? false,
                width,
            },
            maxFontSize,
        };
    }

    /**
     * Resolves a bracket-wrapped button label's font/width and focused
     * style. `focusedStyle` ambiently sizes/formats the label while focused,
     * layered over the base `style`; with neither set, this stays a cheap
     * plain-font measurement.
     */
    public resolveButton(ctx: CanvasRenderingContext2D, button: ButtonInput): {element: ResolvedButtonElement; maxFontSize: number} {
        const disabled = button.disabled ?? false;
        const focusIndex = this.nextResolveIndex();
        const wasFocused = this.wasFocusedIndex(focusIndex) && !disabled;
        const text = `[${button.label}]`;
        const ambientStyle = this.mergeStyle(button.style, wasFocused ? button.focusedStyle : undefined);

        let font = this.plainFont;
        let width: number;
        let maxFontSize = this.defaults.fontSize;
        if (ambientStyle !== undefined) {
            const resolved = this.resolveLine(ctx, [{content: text, style: ambientStyle}]);
            font = resolved.runs[0]?.run.font ?? this.plainFont;
            width = resolved.width;
            maxFontSize = resolved.maxFontSize;
        } else {
            width = this.measureTextWidth(ctx, text, this.plainFont);
        }

        return {
            element: {kind: "button", text, onClick: button.onClick, focusedStyle: this.resolveFocusedStyle(button.focusedStyle), font, disabled, width},
            maxFontSize,
        };
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
                return this.resolveNumber(ctx, item);
            case "textbox":
                return this.resolveTextbox(ctx, item);
            case "button":
                return this.resolveButton(ctx, item);
            case "select":
                return this.resolveSelect(ctx, item);
        }
    }

    /**
     * Resolves and measures every item in `line` - plain text segments
     * flatten to styled runs; inputs resolve via {@link resolveInput}. A
     * `hidden` input contributes nothing, as if absent. The line's overall
     * height is at least this display's minimum line height, but grows to
     * fit whichever element uses the largest font - each item's own
     * `align` then decides where it sits within that height.
     */
    public resolveElements(ctx: CanvasRenderingContext2D, line: DisplayLine): ResolvedElementLine {
        let width = 0;
        let maxFontSize = 0;

        const elements: ResolvedElement[] = line.flatMap((item): ResolvedElement[] => {
            const align = item.align ?? "top";
            if (isInput(item)) {
                if (item.hidden) {
                    return [];
                }
                const {element, maxFontSize: inputFontSize} = this.resolveInput(ctx, item);
                maxFontSize = Math.max(maxFontSize, inputFontSize);
                width += element.width;
                return [{...element, fontSize: inputFontSize, align}];
            }

            const {runs: measured, width: textWidth, maxFontSize: textFontSize} = this.resolveLine(ctx, [item]);
            maxFontSize = Math.max(maxFontSize, textFontSize);
            width += textWidth;
            return [{kind: "text", runs: measured, width: textWidth, fontSize: textFontSize, align}];
        });

        return {elements, width, height: this.lineHeightFor(maxFontSize)};
    }

    /** Paints a translucent grey sheen over `rect`, marking a disabled element. Must be drawn last, on top of the element's normal painting. */
    private paintDisabledOverlay(ctx: CanvasRenderingContext2D, rect: BoundingRect): void {
        ctx.fillStyle = this.defaults.disabledOverlayColor;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    /** Paints a translucent grey sheen over the `radius`-sized circle at `(cx, cy)`, marking a disabled radio option - covers just its marker, not its label. Must be drawn last, on top of the element's normal painting. */
    private paintDisabledCircleOverlay(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
        ctx.fillStyle = this.defaults.disabledOverlayColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Tints a themed box's fill (inset 1px so its bevel/outline stays visible) - used to apply a state style's `background` inside a box rather than around it. */
    private fillBoxInterior(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    }

    /** Top-left y a `size`-tall box centres at vertically within `rect`. */
    private centeredBoxY(rect: BoundingRect, size: number): number {
        return rect.y + (rect.h - size) / 2;
    }

    /** Draws a checkbox's box (themed, tinted by `style`'s background) plus a tick mark (coloured by `style`'s foreground) when `checked`, centred vertically within `rect` - the same rect its focus/selection highlight fills. */
    private drawCheckboxBox(ctx: CanvasRenderingContext2D, rect: BoundingRect, size: number, checked: boolean, style: ResolvedStateStyle): void {
        const x = rect.x;
        const y = this.centeredBoxY(rect, size);
        this.theme.drawBox(ctx, x, y, size, size, "sunken");

        if (style.background) {
            this.fillBoxInterior(ctx, x, y, size, size, style.background);
        }

        if (checked) {
            ctx.strokeStyle = style.foreground ?? this.theme.boxForeground;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + size * 0.2, y + size * 0.55);
            ctx.lineTo(x + size * 0.42, y + size * 0.78);
            ctx.lineTo(x + size * 0.82, y + size * 0.22);
            ctx.stroke();
        }
    }

    /** The radio group's own natural height - the same value its {@link LineItemMeta.fontSize} was derived from in {@link resolveRadio} - used as the box each option's own `align` positions itself within. */
    private radioOwnHeight(element: ResolvedRadioElement): number {
        return this.lineHeightFor(Math.max(0, ...element.options.map((option) => option.fontSize)));
    }

    /** Computes a resolved radio element's options' on-screen rects, walking left-to-right from `x`. Each option's own `align` positions it within the radio's own natural height, independent of its siblings. */
    private layoutRadio(element: ResolvedRadioElement, x: number, y: number, height: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        const ownHeight = this.radioOwnHeight(element);
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            const optionY = y + this.elementVerticalOffset(option, ownHeight);
            focusables.push({rect: {x: elemX, y: optionY, w: optionWidth, h: height}, activate: () => option.onSelect(option.key), disabled: option.disabled});
            elemX += optionWidth;
        });
        return focusables;
    }

    /** Draws a resolved radio element's marker circle plus label per option, walking left-to-right from `x`. Each option's own `align` positions it within the radio's own natural height, independent of its siblings. */
    private paintRadio(ctx: CanvasRenderingContext2D, element: ResolvedRadioElement, x: number, y: number, height: number, focusedRect: BoundingRect | null): void {
        const ownHeight = this.radioOwnHeight(element);
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            const optionY = y + this.elementVerticalOffset(option, ownHeight);
            const rect: BoundingRect = {x: elemX, y: optionY, w: optionWidth, h: height};
            const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !option.disabled;
            const active = focused ? option.focusedStyle : (option.selected ? option.selectedStyle : null);
            const markerStyle = option.selected ? option.inputSelectedStyle : option.inputStyle;

            const highlightRect: BoundingRect = {x: elemX, y: optionY, w: optionWidth, h: option.fontSize};
            if (active?.background) {
                ctx.fillStyle = active.background;
                ctx.fillRect(highlightRect.x, highlightRect.y, highlightRect.w, highlightRect.h);
            }

            const markerRadius = this.defaults.radioMarkerSize / 2;
            const markerCx = elemX + markerRadius;
            const markerCy = highlightRect.y + highlightRect.h / 2;
            this.theme.drawRadioMarker(ctx, markerCx, markerCy, markerRadius, option.selected, markerStyle.foreground, markerStyle.background);

            const labelX = elemX + this.defaults.radioMarkerSize + this.defaults.radioMarkerGap;
            this.drawLine(ctx, option.labelRuns, labelX, optionY, height, active?.foreground);

            if (option.disabled) {
                this.paintDisabledCircleOverlay(ctx, markerCx, markerCy, markerRadius);
            }

            elemX += optionWidth;
        });
    }

    /** Computes a resolved checkbox element's on-screen rect. It activates by invoking `onToggle` with its flipped checked state. */
    private layoutCheckbox(element: ResolvedCheckboxElement, x: number, y: number, height: number): FocusableElement[] {
        return [{rect: {x, y, w: element.width, h: height}, activate: () => element.onToggle(!element.checked), disabled: element.disabled}];
    }

    /** Draws a resolved checkbox element's box plus label at `x`. */
    private paintCheckbox(ctx: CanvasRenderingContext2D, element: ResolvedCheckboxElement, x: number, y: number, height: number, focusedRect: BoundingRect | null): void {
        const rect: BoundingRect = {x, y, w: element.width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;
        const active = focused ? element.focusedStyle : (element.checked ? element.selectedStyle : null);
        const boxStyle = element.checked ? element.inputSelectedStyle : element.inputStyle;

        const highlightRect: BoundingRect = {x, y, w: element.width, h: element.fontSize};
        if (active?.background) {
            ctx.fillStyle = active.background;
            ctx.fillRect(highlightRect.x, highlightRect.y, highlightRect.w, highlightRect.h);
        }

        this.drawCheckboxBox(ctx, highlightRect, this.defaults.checkboxSize, element.checked, boxStyle);

        const labelX = x + this.defaults.checkboxSize + this.defaults.checkboxGap;
        this.drawLine(ctx, element.labelRuns, labelX, y, height, active?.foreground);

        if (element.disabled) {
            const boxY = this.centeredBoxY(highlightRect, this.defaults.checkboxSize);
            this.paintDisabledOverlay(ctx, {x, y: boxY, w: this.defaults.checkboxSize, h: this.defaults.checkboxSize});
        }
    }

    /** Computes a number input's or textbox's on-screen rect - identical for both, differing only in which edit handle is attached. */
    private layoutTextBoxFocusable(x: number, y: number, width: number, height: number, disabled: boolean, edit: Pick<FocusableElement, "numberEdit"> | Pick<FocusableElement, "textEdit">): FocusableElement[] {
        return [{
            rect: {x, y, w: width, h: height},
            activate: () => undefined,
            disabled,
            ...edit,
        }];
    }

    /** Computes a resolved number element's on-screen rect. */
    private layoutNumber(element: ResolvedNumberElement, x: number, y: number, height: number): FocusableElement[] {
        return this.layoutTextBoxFocusable(x, y, element.width, height, element.disabled, {
            numberEdit: {getValue: () => element.value, step: element.step, allowDecimal: element.allowDecimal, onChange: element.onChange},
        });
    }

    /** Computes a resolved textbox element's on-screen rect. */
    private layoutTextbox(element: ResolvedTextboxElement, x: number, y: number, height: number): FocusableElement[] {
        return this.layoutTextBoxFocusable(x, y, element.width, height, element.disabled, {
            textEdit: {getValue: () => element.value, allowedChars: element.allowedChars, disallowedChars: element.disallowedChars, onChange: element.onChange},
        });
    }

    /** Whether a blinking edit cursor should currently be drawn, per this display's cursor-blink interval. */
    private isCursorBlinkVisible(): boolean {
        return Math.floor(Date.now() / this.defaults.cursorBlinkIntervalMs) % 2 === 0;
    }

    /** Shared paint core for {@link paintNumber}/{@link paintTextbox}: draws the sunken box, its text, and any edit selection at `x`, in `font`. */
    private paintTextBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, focusedStyle: ResolvedStateStyle, editingStyle: ResolvedStateStyle, disabled: boolean, focusedRect: BoundingRect | null, text: string, editing: boolean, editCursorPos: number | null, editSelection: {start: number; end: number} | null, selectionStyle: ResolvedStateStyle, font: string, fontSize: number): void {
        const rect: BoundingRect = {x, y, w: width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !disabled;

        const boxHeight = this.lineHeightFor(fontSize) - 4;
        const boxY = y + (fontSize - boxHeight) / 2;

        // focusedStyle's background is a halo, shown whenever focused (editing too).
        if (focused && focusedStyle.background) {
            const pad = this.defaults.focusHighlightPadding;
            ctx.fillStyle = focusedStyle.background;
            ctx.fillRect(x - pad, boxY - pad, width + pad * 2, boxHeight + pad * 2);
        }

        this.theme.drawBox(ctx, x, boxY, width, boxHeight, "sunken");

        if (editing && editingStyle.background) {
            this.fillBoxInterior(ctx, x, boxY, width, boxHeight, editingStyle.background);
        }

        const textColor = editing ? (editingStyle.foreground ?? this.theme.boxForeground) : this.theme.boxForeground;

        ctx.font = font;
        const padding = this.defaults.numberInputPadding;
        const textX = x + padding;
        const textY = y;
        const innerWidth = Math.max(0, width - padding * 2);

        // Content wider than the box scrolls horizontally to keep the caret
        // in view - `scrollX` is recomputed fresh each frame straight from
        // the caret's pixel position, rather than tracked as sticky state.
        // The caret is kept `caretMargin` px clear of the clip edge, rather
        // than flush against it, so its own 1px-wide rect never falls
        // outside the clip rect. While a selection is active, the scroll is
        // instead driven by whichever of the caret/selection's far edge
        // sits furthest right - so extending a selection rightward keeps
        // scrolling to follow it - unless that would push the caret itself
        // off the left edge, in which case the caret wins and the
        // selection's far edge is left to scroll out of view instead.
        const caretMargin = 2;
        const caretVisibleWidth = Math.max(0, innerWidth - caretMargin);
        const totalWidth = this.measureTextWidth(ctx, text, font);
        const caretX = editCursorPos !== null ? this.measureTextWidth(ctx, text.slice(0, editCursorPos), font) : 0;
        const selectionEndX = editSelection !== null ? this.measureTextWidth(ctx, text.slice(0, editSelection.end), font) : caretX;
        const rightAnchorX = Math.max(caretX, selectionEndX);
        let scrollX = Math.max(0, Math.min(rightAnchorX - caretVisibleWidth, totalWidth - caretVisibleWidth));
        if (caretX < scrollX) {
            scrollX = caretX;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(textX, boxY, innerWidth, boxHeight);
        ctx.clip();

        if (editing && editSelection !== null) {
            const selStartX = this.measureTextWidth(ctx, text.slice(0, editSelection.start), font);
            const selEndX = this.measureTextWidth(ctx, text.slice(0, editSelection.end), font);
            ctx.fillStyle = selectionStyle.background ?? this.theme.boxForeground;
            ctx.fillRect(textX - scrollX + selStartX, boxY + 2, selEndX - selStartX, boxHeight - 4);

            ctx.fillStyle = textColor;
            ctx.fillText(text.slice(0, editSelection.start), textX - scrollX, textY);
            ctx.fillStyle = selectionStyle.foreground ?? this.theme.surfaceBackground;
            ctx.fillText(text.slice(editSelection.start, editSelection.end), textX - scrollX + selStartX, textY);
            ctx.fillStyle = textColor;
            ctx.fillText(text.slice(editSelection.end), textX - scrollX + selEndX, textY);
        } else {
            ctx.fillStyle = textColor;
            ctx.fillText(text, textX - scrollX, textY);
        }

        if (editing && this.isCursorBlinkVisible()) {
            ctx.fillRect(textX - scrollX + caretX + 1, boxY + 2, 1, boxHeight - 4);
        }

        ctx.restore();

        if (disabled) {
            this.paintDisabledOverlay(ctx, {x, y: boxY, w: width, h: boxHeight});
        }
    }

    /** Draws a resolved number element's box at `x`; `value` is stringified for display. */
    private paintNumber(ctx: CanvasRenderingContext2D, element: ResolvedNumberElement, x: number, y: number, height: number, focusedRect: BoundingRect | null, editText: string | null, editCursorPos: number | null, editSelection: {start: number; end: number} | null): void {
        const focused = focusedRect !== null && rectsEqual({x, y, w: element.width, h: height}, focusedRect) && !element.disabled;
        const editing = focused && editText !== null;
        const text = editing ? editText : String(element.value);
        this.paintTextBox(ctx, x, y, element.width, height, element.focusedStyle, element.editingStyle, element.disabled, focusedRect, text, editing, editCursorPos, editSelection, element.selectionStyle, element.font, element.fontSize);
    }

    /** Draws a resolved textbox element's box at `x`; the value is shown as-is. */
    private paintTextbox(ctx: CanvasRenderingContext2D, element: ResolvedTextboxElement, x: number, y: number, height: number, focusedRect: BoundingRect | null, editText: string | null, editCursorPos: number | null, editSelection: {start: number; end: number} | null): void {
        const focused = focusedRect !== null && rectsEqual({x, y, w: element.width, h: height}, focusedRect) && !element.disabled;
        const editing = focused && editText !== null;
        const text = editing ? editText : element.value;
        this.paintTextBox(ctx, x, y, element.width, height, element.focusedStyle, element.editingStyle, element.disabled, focusedRect, text, editing, editCursorPos, editSelection, element.selectionStyle, element.font, element.fontSize);
    }

    /** Computes a resolved button's on-screen rect: its measured width, padded out by 2 canvas pixels on every side. */
    public layoutButton(element: ResolvedButtonElement, x: number, y: number, height: number): FocusableElement[] {
        return [{rect: {x: x - 2, y: y - 2, w: element.width + 4, h: height}, activate: element.onClick, disabled: element.disabled}];
    }

    /** Draws a resolved button's bracket-wrapped label at `(x, y)`, highlighted when `focusedRect` matches its rect. */
    private paintButton(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, height: number, focusedRect: BoundingRect | null): void {
        const rect: BoundingRect = {x: x - 2, y: y - 2, w: element.width + 4, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;

        const active = focused ? element.focusedStyle : null;
        if (active?.background) {
            ctx.fillStyle = active.background;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        ctx.font = element.font;
        ctx.fillStyle = active?.foreground ?? this.defaults.foreground;
        ctx.fillText(element.text, x, y);
    }

    /**
     * Draws a resolved button standing on its own (e.g. a popup's footer
     * button row), reading this display's own focus state.
     */
    public drawButton(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, height: number): void {
        this.paintButton(ctx, element, x, y, height, this.getFocusedRect());
    }

    /** The closed box's own visual rect at `(x, y)` - shorter than the line's overall height when other elements need a bigger font. `paintSelect` and the dropdown both anchor off this, not the coarser line-height focusable rect. */
    private selectBoxRect(element: ResolvedSelectElement, x: number, y: number): BoundingRect {
        const boxHeight = this.lineHeightFor(element.closedBoxFontSize) - 4;
        return {x, y: y + (element.closedBoxFontSize - boxHeight) / 2, w: element.width, h: boxHeight};
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
                rowAmbientStyle: element.rowAmbientStyle,
                rowHeight: this.lineHeightFor(element.rowFontSize),
                boxRect: this.selectBoxRect(element, x, y),
            },
            disabled: element.disabled,
        }];
    }

    /** Draws a resolved select element's closed combo box at `x`: a themed box showing the selected option's label, plus a dropdown-arrow button. */
    private paintSelect(ctx: CanvasRenderingContext2D, element: ResolvedSelectElement, x: number, y: number, height: number, focusedRect: BoundingRect | null, open: boolean): void {
        const rect: BoundingRect = {x, y, w: element.width, h: height};
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;

        const selected = element.options[element.selectedIndex];
        const {y: boxY, h: boxHeight} = this.selectBoxRect(element, x, y);
        const arrowWidth = this.defaults.selectArrowWidth;
        const textBoxWidth = element.width - arrowWidth;

        const stateStyle = open ? element.expandedStyle : (focused ? element.focusedStyle : null);
        const foreground = selected?.selectedStyle?.foreground ?? stateStyle?.foreground;
        const background = selected?.selectedStyle?.background ?? stateStyle?.background;

        this.theme.drawBox(ctx, x, boxY, textBoxWidth, boxHeight, "sunken");

        if (background) {
            this.fillBoxInterior(ctx, x, boxY, textBoxWidth, boxHeight, background);
        }

        if (selected) {
            this.drawLine(ctx, element.closedBoxLabelRuns, x + this.defaults.selectPadding, y, height, foreground);
        }

        this.theme.drawSelectArrowButton(ctx, x + textBoxWidth, boxY, arrowWidth, boxHeight, open);

        if (element.disabled) {
            this.paintDisabledOverlay(ctx, {x, y: boxY, w: element.width, h: boxHeight});
        }
    }

    /**
     * Draws a select input's open dropdown list below `boxRect`, on top of
     * whatever's underneath, highlighting `highlightIndex`'s row.
     *
     * @returns Each option row's on-screen rect, top to bottom, for hit-testing clicks.
     */
    private paintSelectDropdownRows(ctx: CanvasRenderingContext2D, selectEdit: SelectEditHandle, boxRect: BoundingRect, highlightIndex: number): BoundingRect[] {
        const rowHeight = selectEdit.rowHeight;
        const listHeight = rowHeight * selectEdit.options.length;
        const listRect: BoundingRect = {x: boxRect.x, y: boxRect.y + boxRect.h, w: boxRect.w, h: listHeight};

        this.theme.drawBox(ctx, listRect.x, listRect.y, listRect.w, listRect.h, "sunken");

        return selectEdit.options.map((option, i) => {
            const rowRect: BoundingRect = {x: listRect.x, y: listRect.y + i * rowHeight, w: listRect.w, h: rowHeight};
            const highlighted = i === highlightIndex && !option.disabled;
            const rowStyle = highlighted ? option.focusedStyle : (option.key === selectEdit.selectedKey ? option.selectedStyle : null);
            const background = rowStyle?.background ?? selectEdit.rowAmbientStyle.background;
            const foreground = rowStyle?.foreground ?? selectEdit.rowAmbientStyle.foreground;

            if (background) {
                ctx.fillStyle = background;
                ctx.fillRect(rowRect.x, rowRect.y, rowRect.w, rowRect.h);
            }

            const textY = rowRect.y + (rowHeight - option.fontSize) / 2;
            this.drawLine(ctx, option.labelRuns, rowRect.x + this.defaults.selectPadding, textY, rowHeight, foreground);

            if (option.disabled) {
                this.paintDisabledOverlay(ctx, rowRect);
            }

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
        this.openSelectDropdownRects = this.paintSelectDropdownRows(ctx, selectEdit, selectEdit.boxRect, this.openSelectHighlight);
    }

    /**
     * The open select's dropdown-list bounds this frame, if any is open -
     * computed from the current layout without painting.
     */
    private getOpenSelectDropdownRect(): BoundingRect | null {
        if (this.openSelectCursor === null) {
            return null;
        }
        const selectEdit = this.focusables[this.openSelectCursor]?.selectEdit;
        if (!selectEdit) {
            return null;
        }
        return {x: selectEdit.boxRect.x, y: selectEdit.boxRect.y + selectEdit.boxRect.h, w: selectEdit.boxRect.w, h: selectEdit.rowHeight * selectEdit.options.length};
    }

    /**
     * The bounding rect of everything this display currently occupies.
     */
    public getBounds(): BoundingRect | null {
        if (this.cachedBounds !== undefined) {
            return this.cachedBounds;
        }
        let bounds: BoundingRect | null = null;
        for (const focusable of this.focusables) {
            bounds = bounds ? unionRect(bounds, focusable.rect) : focusable.rect;
        }
        const dropdownRect = this.getOpenSelectDropdownRect();
        if (dropdownRect !== null) {
            bounds = bounds ? unionRect(bounds, dropdownRect) : dropdownRect;
        }
        this.cachedBounds = bounds;
        return bounds;
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
            case "textbox":
                return this.layoutTextbox(element, x, y, height);
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
        focusedRect: BoundingRect | null,
        editText: string | null,
        editCursorPos: number | null,
        editSelection: {start: number; end: number} | null,
        openRect: BoundingRect | null,
    ): void {
        switch (element.kind) {
            case "radio":
                this.paintRadio(ctx, element, x, y, height, focusedRect);
                break;
            case "checkbox":
                this.paintCheckbox(ctx, element, x, y, height, focusedRect);
                break;
            case "number":
                this.paintNumber(ctx, element, x, y, height, focusedRect, editText, editCursorPos, editSelection);
                break;
            case "textbox":
                this.paintTextbox(ctx, element, x, y, height, focusedRect, editText, editCursorPos, editSelection);
                break;
            case "button":
                this.paintButton(ctx, element, x, y, height, focusedRect);
                break;
            case "select":
                this.paintSelect(ctx, element, x, y, height, focusedRect, openRect !== null && rectsEqual({x, y, w: element.width, h: height}, openRect));
                break;
        }
    }

    /** Vertical offset from a line's shared `y` for `element`, so its own single-line height sits at the top/centre/bottom of `lineHeight` per its `align`. */
    private elementVerticalOffset(element: LineItemMeta, lineHeight: number): number {
        const ownHeight = this.lineHeightFor(element.fontSize);
        switch (element.align) {
            case "centre":
                return (lineHeight - ownHeight) / 2;
            case "bottom":
                return lineHeight - ownHeight;
            default:
                return 0;
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
            const elemY = y + this.elementVerticalOffset(element, line.height);
            if (element.kind !== "text") {
                focusables.push(...this.layoutInput(element, elemX, elemY, line.height));
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
        const editCursorPos = this.getEditCursorPos();
        const editSelection = this.getEditSelection();
        const openRect = this.getOpenRect();

        let elemX = x;
        for (const element of line.elements) {
            const elemY = y + this.elementVerticalOffset(element, line.height);
            if (element.kind === "text") {
                this.drawLine(ctx, element.runs, elemX, elemY, line.height);
            } else {
                this.paintInput(ctx, element, elemX, elemY, line.height, focusedRect, editText, editCursorPos, editSelection, openRect);
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
        this.cachedBounds = undefined;

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
        if (this.editingTextCursor !== null && (this.editingTextCursor !== this.cursor || !this.focusables[this.editingTextCursor]?.textEdit)) {
            this.editingTextCursor = null;
            this.textEditBuffer = null;
        }
    }

    /** The currently focused element's rect, if any - `null` whenever this display itself isn't {@link isFocused focused} (e.g. blurred in `"click"` mode), even if a cursor position is still remembered. */
    private getFocusedRect(): BoundingRect | null {
        return this.isFocused() && this.cursor !== null ? this.focusables[this.cursor]?.rect ?? null : null;
    }

    /** The focused number input or textbox's in-progress edit text, if it's the one currently being edited - they're mutually exclusive, so at most one of {@link numberEditBuffer}/{@link textEditBuffer} ever matches {@link cursor}. */
    private getEditText(): string | null {
        if (this.cursor !== null && this.numberEditBuffer?.cursor === this.cursor) {
            return this.numberEditBuffer.text;
        }
        if (this.cursor !== null && this.textEditBuffer?.cursor === this.cursor) {
            return this.textEditBuffer.text;
        }
        return null;
    }

    /** The focused number input or textbox's in-progress edit caret position (a character index into {@link getEditText}), if it's the one currently being edited. */
    private getEditCursorPos(): number | null {
        if (this.cursor !== null && this.numberEditBuffer?.cursor === this.cursor) {
            return this.numberEditBuffer.pos;
        }
        if (this.cursor !== null && this.textEditBuffer?.cursor === this.cursor) {
            return this.textEditBuffer.pos;
        }
        return null;
    }

    /** The focused number input or textbox's in-progress Shift+Arrow selection range (character indices into {@link getEditText}), if it has an active one. */
    private getEditSelection(): {start: number; end: number} | null {
        let buffer: {pos: number; anchor: number | null} | null = null;
        if (this.cursor !== null && this.numberEditBuffer?.cursor === this.cursor) {
            buffer = this.numberEditBuffer;
        } else if (this.cursor !== null && this.textEditBuffer?.cursor === this.cursor) {
            buffer = this.textEditBuffer;
        }
        if (buffer === null || buffer.anchor === null || buffer.anchor === buffer.pos) {
            return null;
        }
        return {start: Math.min(buffer.pos, buffer.anchor), end: Math.max(buffer.pos, buffer.anchor)};
    }

    /** The open select input's box rect, if a dropdown is currently open. */
    private getOpenRect(): BoundingRect | null {
        return this.openSelectCursor !== null ? this.focusables[this.openSelectCursor]?.rect ?? null : null;
    }

    /**
     * Moves the cursor one step through {@link focusables} in their sorted
     * order, treating "nothing selected" (`null`) as one extra stop between
     * the last element and the first. Disabled elements are skipped over -
     * if every element is disabled, the cursor ends up back where it
     * started.
     *
     * @param delta - `1` to move to the next element, `-1` to move to the previous one.
     */
    private moveCursorHorizontal(delta: 1 | -1): void {
        const stopCount = this.focusables.length + 1;
        let stop = this.cursor === null ? 0 : this.cursor + 1;
        for (let i = 0; i < stopCount; i++) {
            stop = (stop + delta + stopCount) % stopCount;
            if (stop === 0 || !this.focusables[stop - 1].disabled) {
                break;
            }
        }
        this.setCursor(stop === 0 ? null : stop - 1);
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
     * closest to the currently focused one. Rows made up entirely of
     * disabled elements are skipped over, as is any disabled element within
     * an otherwise-enabled row.
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
        let stop = currentRowIndex === -1 ? 0 : currentRowIndex + 1;

        for (let i = 0; i < stopCount; i++) {
            stop = (stop + delta + stopCount) % stopCount;
            if (stop === 0) {
                this.setCursor(null);
                return;
            }

            const targetRow = rows[stop - 1].filter((focusable) => !focusable.disabled);
            if (targetRow.length === 0) {
                continue;
            }

            const targetX = currentRect?.x ?? targetRow[0].rect.x;
            const closest = targetRow.reduce((best, candidate) =>
                Math.abs(candidate.rect.x - targetX) < Math.abs(best.rect.x - targetX) ? candidate : best);
            this.setCursor(this.focusables.indexOf(closest));
            return;
        }
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
        this.commitPendingTextEdit();
        this.openSelectCursor = null;
        this.editingNumberCursor = null;
        this.editingTextCursor = null;
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
     * If {@link textEditBuffer} holds an edit for the currently focused
     * element, calls that textbox's `onChange` with the result, then clears
     * the buffer either way. Whether `onChange` accepts or rejects (returns
     * `false`) the edit is left entirely to the caller - either way the
     * buffer is discarded, so the next paint shows the textbox's `value` as
     * last resolved, which only reflects the edit if the caller applied it.
     */
    private commitPendingTextEdit(): void {
        const buffer = this.textEditBuffer;
        this.textEditBuffer = null;
        if (buffer === null || this.cursor === null || buffer.cursor !== this.cursor) {
            return;
        }
        const textEdit = this.focusables[this.cursor]?.textEdit;
        if (!textEdit) {
            return;
        }
        textEdit.onChange(buffer.text);
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
     * Handles Ctrl+A/C/X/V.
     *
     * @param cursor - Index of the focused input within {@link focusables}.
     * @param currentText - The buffer's current text.
     * @param pos - The buffer's current caret position.
     * @param anchor - The buffer's current selection anchor, if any.
     * @param event - The keyboard event.
     * @param sanitizePaste - Filters clipboard text down to what may be inserted - e.g. digits-only for a number input.
     * @param isStillEditing - Whether the buffer this call started with is still the one being edited - checked before a Ctrl+V's clipboard read is applied, in case focus moved elsewhere while it was pending.
     * @param setBuffer - Applies the buffer's next value.
     * @returns Whether `event` was one of these Ctrl-combinations, handled either way (a no-op Ctrl+C/X still counts).
     */
    private handleClipboardShortcut(
        cursor: number,
        currentText: string,
        pos: number,
        anchor: number | null,
        event: KeyboardEvent,
        sanitizePaste: (pasted: string) => string,
        isStillEditing: () => boolean,
        setBuffer: (buffer: {cursor: number; text: string; pos: number; anchor: number | null}) => void,
    ): boolean {
        if (!event.ctrlKey && !event.metaKey) {
            return false;
        }
        const key = event.key.toLowerCase();
        const selection = anchor !== null && anchor !== pos ? {start: Math.min(pos, anchor), end: Math.max(pos, anchor)} : null;

        if (key === "a") {
            setBuffer({cursor, text: currentText, pos: currentText.length, anchor: 0});
            return true;
        }
        if (key === "c") {
            if (selection) {
                copyToClipboard(currentText.slice(selection.start, selection.end));
            }
            return true;
        }
        if (key === "x") {
            if (selection) {
                copyToClipboard(currentText.slice(selection.start, selection.end));
                setBuffer({cursor, text: currentText.slice(0, selection.start) + currentText.slice(selection.end), pos: selection.start, anchor: null});
            }
            return true;
        }
        if (key === "v") {
            void readFromClipboard().then((pasted) => {
                if (!isStillEditing()) {
                    return;
                }
                const clean = sanitizePaste(pasted);
                const insertAt = selection ? selection.start : pos;
                const base = selection ? currentText.slice(0, selection.start) + currentText.slice(selection.end) : currentText;
                setBuffer({cursor, text: base.slice(0, insertAt) + clean + base.slice(insertAt), pos: insertAt + clean.length, anchor: null});
            });
            return true;
        }
        return false;
    }

    /**
     * Handles every edit-buffer key a number input and a textbox share
     * while in edit mode, except `Escape`/`Enter`/`Space`/`Backspace`/`Delete`
     * and (for a number input) `ArrowUp`/`ArrowDown`.
     *
     * @param cursor - Index of the focused input within {@link focusables}.
     * @param currentText - The buffer's current text.
     * @param pos - The buffer's current caret position.
     * @param anchor - The buffer's current selection anchor, if any.
     * @param event - The keyboard event.
     * @param acceptsChar - Whether `char` may be inserted (typed or pasted), given `textWithoutChar` - the buffer's text with any active selection (or, mid-paste, everything already accepted from earlier in the pasted string) removed. E.g. a number input rejects a second `.`.
     * @param isStillEditing - Forwarded to {@link handleClipboardShortcut}.
     * @param setBuffer - Applies the buffer's next value.
     */
    private handleTextEditingKey(
        cursor: number,
        currentText: string,
        pos: number,
        anchor: number | null,
        event: KeyboardEvent,
        acceptsChar: (char: string, textWithoutChar: string) => boolean,
        isStillEditing: () => boolean,
        setBuffer: (buffer: {cursor: number; text: string; pos: number; anchor: number | null}) => void,
    ): void {
        if (this.handleClipboardShortcut(
            cursor, currentText, pos, anchor, event,
            (pasted) => {
                const selection = anchor !== null && anchor !== pos ? {start: Math.min(pos, anchor), end: Math.max(pos, anchor)} : null;
                let building = selection ? currentText.slice(0, selection.start) + currentText.slice(selection.end) : currentText;
                let accepted = "";
                for (const char of pasted) {
                    if (acceptsChar(char, building)) {
                        accepted += char;
                        building += char;
                    }
                }
                return accepted;
            },
            isStillEditing,
            setBuffer,
        )) {
            return;
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const delta = event.key === "ArrowLeft" ? -1 : 1;
            if (event.shiftKey) {
                const nextPos = Math.max(0, Math.min(currentText.length, pos + delta));
                setBuffer({cursor, text: currentText, pos: nextPos, anchor: anchor ?? pos});
                return;
            }
            if (anchor !== null && anchor !== pos) {
                const collapsed = delta < 0 ? Math.min(pos, anchor) : Math.max(pos, anchor);
                setBuffer({cursor, text: currentText, pos: collapsed, anchor: null});
                return;
            }
            setBuffer({cursor, text: currentText, pos: Math.max(0, Math.min(currentText.length, pos + delta)), anchor: null});
            return;
        }

        const selection = anchor !== null && anchor !== pos ? {start: Math.min(pos, anchor), end: Math.max(pos, anchor)} : null;
        const textWithoutSelection = selection ? currentText.slice(0, selection.start) + currentText.slice(selection.end) : currentText;

        let nextText: string;
        let nextPos: number;
        if (event.key === "Backspace" || event.key === "Delete") {
            if (selection) {
                nextText = textWithoutSelection;
                nextPos = selection.start;
            } else if (event.key === "Backspace") {
                if (pos === 0) {
                    return;
                }
                nextText = currentText.slice(0, pos - 1) + currentText.slice(pos);
                nextPos = pos - 1;
            } else {
                if (pos === currentText.length) {
                    return;
                }
                nextText = currentText.slice(0, pos) + currentText.slice(pos + 1);
                nextPos = pos;
            }
        } else if (event.key.length === 1 && acceptsChar(event.key, textWithoutSelection)) {
            const insertAt = selection ? selection.start : pos;
            nextText = textWithoutSelection.slice(0, insertAt) + event.key + textWithoutSelection.slice(insertAt);
            nextPos = insertAt + 1;
        } else {
            return;
        }

        setBuffer({cursor, text: nextText, pos: nextPos, anchor: null});
    }

    /**
     * Enters edit mode for the number input at `cursor` (see {@link
     * editingNumberCursor}), seeding {@link numberEditBuffer} with
     * `initialText` and placing the caret at its end.
     *
     * @param cursor - Index of the number input within {@link focusables}.
     * @param numberEdit - The number input's edit handle.
     * @param initialText - The buffer's starting text.
     */
    private startEditingNumber(cursor: number, numberEdit: NumberEditHandle, initialText: string): void {
        this.editingNumberCursor = cursor;
        this.numberEditBuffer = {cursor, text: initialText, pos: initialText.length, anchor: null};
    }

    /**
     * Handles a key press while a number input is in edit mode (see {@link
     * editingNumberCursor}).
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
            const text = String(next);
            this.numberEditBuffer = {cursor, text, pos: text.length, anchor: null};
            return;
        }

        const current = this.numberEditBuffer?.cursor === cursor ? this.numberEditBuffer : null;
        const currentText = current?.text ?? String(numberEdit.getValue());
        const pos = current?.pos ?? currentText.length;
        const anchor = current?.anchor ?? null;

        this.handleTextEditingKey(
            cursor, currentText, pos, anchor, event,
            (char, textWithoutChar) => /^[0-9]$/.test(char) || (char === "." && numberEdit.allowDecimal && !textWithoutChar.includes(".")),
            () => this.editingNumberCursor === cursor,
            (buffer) => {
                this.numberEditBuffer = buffer;
            },
        );
    }

    /**
     * Enters edit mode for the textbox at `cursor` (see {@link
     * editingTextCursor}), seeding {@link textEditBuffer} with `initialText`
     * - the current `value` for `Enter`/a click, or `value` with its last
     * character dropped for `Backspace`. The caret always starts at the end
     * of `initialText`.
     *
     * @param cursor - Index of the textbox within {@link focusables}.
     * @param textEdit - The textbox's edit handle.
     * @param initialText - The buffer's starting text.
     */
    private startEditingText(cursor: number, textEdit: TextEditHandle, initialText: string): void {
        this.editingTextCursor = cursor;
        this.textEditBuffer = {cursor, text: initialText, pos: initialText.length, anchor: null};
    }

    /**
     * Whether `char` (a single character) may be typed into a textbox per
     * its `allowedChars`/`disallowedChars` - allowed if `allowedChars` is
     * set and includes it, or unset and `disallowedChars` is set but
     * doesn't include it, or neither is set.
     */
    private isTextCharAllowed(textEdit: TextEditHandle, char: string): boolean {
        if (textEdit.allowedChars !== null) {
            return textEdit.allowedChars.includes(char);
        }
        if (textEdit.disallowedChars !== null) {
            return !textEdit.disallowedChars.includes(char);
        }
        return true;
    }

    /**
     * Handles a key press while a textbox is in edit mode (see {@link
     * editingTextCursor}).
     *
     * @param cursor - Index of the focused textbox within {@link focusables}.
     * @param textEdit - The focused textbox's edit handle.
     * @param event - The keyboard event.
     */
    private handleTextboxInputKey(cursor: number, textEdit: TextEditHandle, event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.textEditBuffer = null;
            this.editingTextCursor = null;
            return;
        }
        if (event.key === "Enter") {
            this.commitPendingTextEdit();
            this.editingTextCursor = null;
            return;
        }

        const current = this.textEditBuffer?.cursor === cursor ? this.textEditBuffer : null;
        const currentText = current?.text ?? textEdit.getValue();
        const pos = current?.pos ?? currentText.length;
        const anchor = current?.anchor ?? null;

        this.handleTextEditingKey(
            cursor, currentText, pos, anchor, event,
            (char) => char !== "\r" && char !== "\n" && this.isTextCharAllowed(textEdit, char),
            () => this.editingTextCursor === cursor,
            (buffer) => {
                this.textEditBuffer = buffer;
            },
        );
    }

    /**
     * The nearest enabled option index from `from`, stepping by `delta` and
     * clamping (not wrapping) at either end. Returns `from` unchanged if
     * there's no enabled option in that direction.
     */
    private nextEnabledOptionIndex(options: ResolvedSelectOption[], from: number, delta: 1 | -1): number {
        let i = from;
        while (i + delta >= 0 && i + delta < options.length) {
            i += delta;
            if (!options[i].disabled) {
                return i;
            }
        }
        return from;
    }

    /**
     * Handles a key press while a select input's dropdown is open.
     * `ArrowUp`/`ArrowDown` move {@link openSelectHighlight} to the nearest
     * enabled option within `selectEdit.options` (clamped, no wrap, skipping
     * disabled options - see {@link nextEnabledOptionIndex}); `ArrowLeft`/
     * `ArrowRight` do nothing; `Enter`/`Space` commit the highlighted option
     * via `selectEdit.onSelect` and close the dropdown, unless it's disabled
     * (in which case the key is ignored and the dropdown stays open);
     * `Escape` closes it without committing, leaving `selected` unchanged.
     * Every other key is ignored - all are swallowed regardless, since
     * {@link handleKeyDown} already calls `preventDefault`/`stopPropagation`
     * up front.
     *
     * @param selectEdit - The open select input's edit handle.
     * @param event - The keyboard event.
     */
    private handleSelectInputKey(selectEdit: SelectEditHandle, event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.openSelectCursor = null;
        } else if (event.key === "ArrowUp") {
            this.openSelectHighlight = this.nextEnabledOptionIndex(selectEdit.options, this.openSelectHighlight, -1);
        } else if (event.key === "ArrowDown") {
            this.openSelectHighlight = this.nextEnabledOptionIndex(selectEdit.options, this.openSelectHighlight, 1);
        } else if (event.key === "Enter" || event.key === " ") {
            if (!selectEdit.options[this.openSelectHighlight].disabled) {
                selectEdit.onSelect(selectEdit.options[this.openSelectHighlight].key);
                this.openSelectCursor = null;
            }
        }
    }

    /**
     * While focused, intercepts every key press before any other
     * key-driven controller sees it.
     *
     * @param event - The keyboard event.
     */
    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.isFocused() || MODIFIER_KEYS.has(event.key)) {
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

        if (cursor !== null && this.editingTextCursor === cursor) {
            const textEdit = this.focusables[cursor].textEdit;
            if (textEdit) {
                this.handleTextboxInputKey(cursor, textEdit, event);
                return;
            }
        }

        if (this.keyDownInterceptor?.(event)) {
            return;
        }
        if (this.focusables.length === 0) {
            return;
        }

        const focusedDisabled = cursor !== null ? this.focusables[cursor].disabled : false;
        const focusedNumberEdit = cursor !== null && !focusedDisabled ? this.focusables[cursor].numberEdit : undefined;
        const focusedTextEdit = cursor !== null && !focusedDisabled ? this.focusables[cursor].textEdit : undefined;

        if (event.key === "ArrowLeft") {
            this.moveCursorHorizontal(-1);
        } else if (event.key === "ArrowRight") {
            this.moveCursorHorizontal(1);
        } else if (event.key === "ArrowUp") {
            this.moveCursorVertical(-1);
        } else if (event.key === "ArrowDown") {
            this.moveCursorVertical(1);
        } else if (cursor !== null && focusedNumberEdit && /^[0-9]$/.test(event.key)) {
            this.startEditingNumber(cursor, focusedNumberEdit, String(focusedNumberEdit.getValue()) + event.key);
        } else if (cursor !== null && focusedNumberEdit && event.key === "Backspace") {
            this.startEditingNumber(cursor, focusedNumberEdit, String(focusedNumberEdit.getValue()).slice(0, -1));
        } else if (cursor !== null && focusedTextEdit && event.key.length === 1 && this.isTextCharAllowed(focusedTextEdit, event.key)) {
            this.startEditingText(cursor, focusedTextEdit, focusedTextEdit.getValue() + event.key);
        } else if (cursor !== null && focusedTextEdit && event.key === "Backspace") {
            this.startEditingText(cursor, focusedTextEdit, focusedTextEdit.getValue().slice(0, -1));
        } else if ((event.key === "Enter" || event.key === " ") && this.cursor !== null && !focusedDisabled) {
            const focusable = this.focusables[this.cursor];
            const selectEdit = focusable.selectEdit;
            const numberEdit = focusable.numberEdit;
            const textEdit = focusable.textEdit;
            if (selectEdit) {
                this.openSelectCursor = this.cursor;
                this.openSelectHighlight = Math.max(0, selectEdit.options.findIndex((option) => option.key === selectEdit.selectedKey));
            } else if (numberEdit) {
                this.startEditingNumber(this.cursor, numberEdit, String(numberEdit.getValue()));
            } else if (textEdit) {
                if (event.key === "Enter") {
                    this.startEditingText(this.cursor, textEdit, textEdit.getValue());
                }
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
     * click against {@link focusables} (as last laid out): a hit on a
     * disabled element is swallowed and otherwise ignored; a hit on an
     * enabled one moves the cursor to it and activates it, same as pressing
     * `Enter` while it's focused - or, for a select input, opens its
     * dropdown, or for a number input not already being edited, enters edit
     * mode. While a select's dropdown is open, a click is tested against
     * {@link openSelectDropdownRects} first: a hit on an enabled option row
     * commits it and closes; a hit on a disabled option row is swallowed
     * without committing or closing; a hit on the select's own box closes it
     * without committing (toggling it shut); a hit elsewhere just closes the
     * dropdown before falling through to the normal hit-test below.
     * Registered on the capture phase and stops propagation while focused,
     * for the same reason as {@link handleMouseDown}.
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
            const optionDisabled = optionIndex !== -1 && selectEdit ? selectEdit.options[optionIndex].disabled : false;
            if (optionDisabled) {
                return;
            }
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
        const focusable = this.focusables[index];
        if (focusable.disabled) {
            return;
        }
        this.setCursor(index);
        const selectEdit = focusable.selectEdit;
        const numberEdit = focusable.numberEdit;
        const textEdit = focusable.textEdit;
        if (selectEdit) {
            this.openSelectCursor = index;
            this.openSelectHighlight = Math.max(0, selectEdit.options.findIndex((option) => option.key === selectEdit.selectedKey));
        } else if (numberEdit) {
            if (this.editingNumberCursor !== index) {
                this.startEditingNumber(index, numberEdit, String(numberEdit.getValue()));
            }
        } else if (textEdit) {
            if (this.editingTextCursor !== index) {
                this.startEditingText(index, textEdit, textEdit.getValue());
            }
        } else {
            focusable.activate();
        }
    };
}
