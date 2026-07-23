import {DEFAULT_DISPLAY_DEFAULTS, Display, DisplayDefaults, MeasuredRun} from "./display";
import {ButtonInput, CheckboxInput, DisplayLine, DisplayLineItem, HrInput, HrLength, Input, NumberInput, RadioInput, SelectInput, TextBoxInputBase, TextInput} from "./input";
import {ChromeTheme} from "./chrome-theme";
import {ResolvedStateStyle, resolveStateStyle} from "./state-style";
import {Alignment, TextSegment, TextStyle} from "./text-style";
import {BoundingRect, expandRect, pointInRect, rectsEqual, unionRect} from "./bounding-rect";
import {ResolvedSpacing, resolveSpacing, ZERO_SPACING} from "./spacing";
import {copyToClipboard, readFromClipboard} from "../../src/util";

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
    /** Half-period of a number input's blinking edit cursor, in milliseconds. */
    cursorBlinkIntervalMs: number;
    /** Horizontal padding inside a select input's box and dropdown rows, in canvas pixels. */
    selectPadding: number;
    /** Width of a select input's dropdown-arrow button, in canvas pixels. */
    selectArrowWidth: number;
    /** Padding added around a number/textbox's sunken box when drawing its `focusedStyle` background - kept outside the box, unlike `editingStyle`/`selectedStyle`, which paint inside it. */
    focusHighlightPadding: number;
    /** Horizontal padding inside a button's box around its label, in canvas pixels. */
    buttonPaddingX: number;
    /** Vertical padding inside a button's box around its label, in canvas pixels. */
    buttonPaddingY: number;
    /** How far a button's label shifts right/down while pressed, in canvas pixels. */
    buttonPressedTextOffset: number;
    /** Fill colour of the sheen painted over a disabled input to grey it out - its whole box for a number/select input, or just the marker/box for a radio option/checkbox. Buttons have no box to grey out - a disabled one just stops highlighting/activating. */
    disabledOverlayColor: string;
}

/** A resolved, measured plain-text item within a line. */
interface ResolvedTextElement {
    kind: "text";
    runs: MeasuredRun[];
    width: number;
}

/** A resolved, measured {@link HrInput}: a plain bar, `width` wide and `thickness` tall. Never focusable, so it sits outside {@link ResolvedFocusableElement} rather than {@link ResolvedInputElement}. */
interface ResolvedHrElement {
    kind: "hr";
    width: number;
    thickness: number;
    /** Explicit line-colour override (a flat fill), or `undefined` to defer to the active {@link ChromeTheme}'s own `drawLine` (e.g. Win98's bevelled groove). */
    color: string | undefined;
    /** Fills the element's content+padding rect behind the bar, or `undefined` for none. */
    background: string | undefined;
    /** See {@link HrInput.length}. */
    length: HrLength;
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
    /** This option's own resolved padding, independent of the radio input's own. */
    padding: ResolvedSpacing;
    /** This option's own resolved margin - pushes neighbouring options apart. */
    margin: ResolvedSpacing;
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
    /** See {@link NumberInput.min}. */
    min: number | undefined;
    /** See {@link NumberInput.max}. */
    max: number | undefined;
    onChange: (value: number) => void;
    focusedStyle: ResolvedStateStyle;
    /** Style overlaid while the box is being edited. */
    editingStyle: ResolvedStateStyle;
    /** Style a Shift+Arrow text selection is drawn with. */
    selectionStyle: ResolvedStateStyle;
    /** Canvas font string for the box's own text - reflects `style`, and `editingStyle`/`focusedStyle` while active, per {@link InteractableDisplay.resolveTextBoxCommon}. */
    font: string;
    /** Font size backing `font`, in canvas pixels. */
    fontSize: number;
    /** Box height: `fontSize` plus vertical padding, mirroring a button's own `height` - big enough that the box doesn't clip the font's own ascenders/descenders or the caret. */
    height: number;
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
    /** Font size backing `font`, in canvas pixels. */
    fontSize: number;
    /** Box height: `fontSize` plus vertical padding, mirroring a button's own `height` - big enough that the box doesn't clip the font's own ascenders/descenders or the caret. */
    height: number;
    disabled: boolean;
    width: number;
}

/** A resolved, measured button: a bevelled box around its label. */
export interface ResolvedButtonElement {
    kind: "button";
    runs: MeasuredRun[];
    onClick: () => void;
    focusedStyle: ResolvedStateStyle;
    /** Largest font size used in the label, in canvas pixels. */
    fontSize: number;
    disabled: boolean;
    width: number;
    /** Box height: label height plus vertical padding. */
    height: number;
    /** From `ButtonInput.align` - positions the box within a taller shared row, like every other input kind. */
    align: Alignment;
}

/** A resolved, measured `interactive: true` text element - focusable/clickable, no box. */
interface ResolvedInteractiveTextElement {
    kind: "interactive-text";
    runs: MeasuredRun[];
    onClick: () => void;
    focusedStyle: ResolvedStateStyle;
    /** Largest font size used in the text, in canvas pixels. */
    fontSize: number;
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
    /** Font size backing `closedBoxLabelRuns`, in canvas pixels. */
    closedBoxFontSize: number;
    /** Closed box height: `closedBoxFontSize` plus vertical padding, mirroring a button's own `height` - big enough that the box doesn't clip the label's own ascenders/descenders. */
    height: number;
    disabled: boolean;
    width: number;
}

/** Every kind of resolved, measured input element a line can contain - mirrors {@link Input}. */
type ResolvedInputElement = ResolvedRadioElement | ResolvedCheckboxElement | ResolvedNumberElement | ResolvedTextboxElement | ResolvedButtonElement | ResolvedSelectElement;

/** Every focusable resolved element kind - inputs plus interactive text. */
type ResolvedFocusableElement = ResolvedInputElement | ResolvedInteractiveTextElement;

/** A line item's own font size, requested vertical alignment, and resolved padding/margin - attached uniformly in {@link InteractableDisplay.resolveElements}, not by each individual `resolve*`. */
interface LineItemMeta {
    fontSize: number;
    align: Alignment;
    /** Space between this element's content and its clickable/focusable bounds - see {@link InputBase.padding}. */
    padding: ResolvedSpacing;
    /** Space outside this element's clickable/focusable bounds, pushing neighbours away - see {@link InputBase.margin}. */
    margin: ResolvedSpacing;
}

type ResolvedElement = (ResolvedTextElement | ResolvedHrElement | ResolvedFocusableElement) & LineItemMeta;

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
    min: number | undefined;
    max: number | undefined;
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
    /** Whether this element shows a visible pressed state while held. Defaults to `false`. */
    pressable?: boolean;
}

/**
 * `KeyboardEvent.key` values for pure modifier keys.
 */
const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock"]);

/** Debug-rect colour for an element's own tight content box - see {@link InteractableDisplay.strokeSpacingDebugRects} for the padding/margin rings drawn around it. */
const CONTENT_DEBUG_COLOR = "lime";

/** Fallback {@link InteractableDisplayDefaults} used for any field an {@link InteractableDisplay} isn't given. */
export const DEFAULT_INTERACTABLE_DISPLAY_DEFAULTS: InteractableDisplayDefaults = {
    ...DEFAULT_DISPLAY_DEFAULTS,
    radioMarkerSize: 12,
    radioMarkerGap: 6,
    radioOptionGap: 16,
    checkboxSize: 12,
    checkboxGap: 6,
    numberInputWidth: 48,
    cursorBlinkIntervalMs: 500,
    selectPadding: 4,
    selectArrowWidth: 18,
    focusHighlightPadding: 2,
    buttonPaddingX: 8,
    buttonPaddingY: 4,
    buttonPressedTextOffset: 1,
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
    private debug = false;
    /** On-screen hit box used in `"click"` focus mode to decide whether a click focuses/blurs this display - see {@link setClickRegion}. Unrelated to {@link getOccupiedBounds}. */
    private clickRegion: BoundingRect | null = null;
    private keyDownInterceptor: ((event: KeyboardEvent) => boolean) | undefined;
    private readonly initialFocusIndex: number | null;

    private focusables: FocusableElement[] = [];
    /** Memoised {@link getOccupiedBounds} result - `undefined` means not yet computed since the last {@link setFocusables} call. */
    private cachedBounds: BoundingRect | null | undefined = undefined;
    private cursor: number | null = null;
    /** Index of the `pressable` focusable currently held down by the mouse, if any. */
    private mousePressedIndex: number | null = null;
    /** Index of the `pressable` focusable currently held down via `Enter`/`Space`, if any - `activate()` fires on release, see {@link handleKeyUp}. */
    private keyboardPressedIndex: number | null = null;
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
        window.addEventListener("keyup", this.handleKeyUp, {capture: true});
        window.addEventListener("mousedown", this.handleMouseDown, {capture: true});
        window.addEventListener("mouseup", this.handleMouseUp, {capture: true});
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
            this.mousePressedIndex = null;
            this.keyboardPressedIndex = null;
            this.focused = this.focusMode === "always";
        } else {
            this.commitPendingNumberEdit();
            this.commitPendingTextEdit();
            this.active = false;
            this.focused = false;
            this.mousePressedIndex = null;
            this.keyboardPressedIndex = null;
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
     * Sets this display's on-screen click region, used in `"click"` focus
     * mode to decide whether a click focuses or blurs it. Unused in
     * `"always"` mode.
     *
     * @param rect - This display's current on-screen bounds, or `null` if not shown.
     */
    public setClickRegion(rect: BoundingRect | null): void {
        this.clickRegion = rect;
    }

    /** Toggles debug mode - see {@link drawDebugBounds}. */
    public setDebug(enabled: boolean): void {
        this.debug = enabled;
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

    /** Normalises a label's `string | TextSegment[] | undefined` content field to a plain {@link TextSegment} array. */
    private normaliseContent(content: string | TextSegment[] | undefined): TextSegment[] {
        if (content === undefined) {
            return [];
        }
        return typeof content === "string" ? [{content}] : content;
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

            // Base `style` always applies (input-level, then option-level);
            // whichever state is active layers on top, same precedence as
            // the label's colour (focusedStyle > selectedStyle).
            const baseStyle = this.mergeStyle(item.style, option.style);
            const stateStyle = focused
                ? this.mergeStyle(item.focusedStyle, option.focusedStyle)
                : (selected ? this.mergeStyle(item.selectedStyle, option.selectedStyle) : undefined);
            const ambientStyle = this.mergeStyle(baseStyle, stateStyle);
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, this.withAmbientStyle(this.normaliseContent(option.content), ambientStyle));

            // This option's own padding/margin are independent of the owning
            // RadioInput's - a nested box, not merged with the parent's.
            const padding = resolveSpacing(option.padding);
            const margin = resolveSpacing(option.margin);
            maxFontSize = Math.max(maxFontSize, labelFontSize + this.verticalSpacing(padding) + this.verticalSpacing(margin));

            width += (i > 0 ? this.defaults.radioOptionGap : 0) + this.radioOptionContentWidth(labelWidth) + this.horizontalSpacing(padding) + this.horizontalSpacing(margin);

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
                inputStyle: this.resolveInputStyle(item.inputStyle, baseStyle, option.inputStyle),
                disabled,
                padding,
                margin,
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
        const {runs: measured, width: labelWidth, maxFontSize} = this.resolveLine(ctx, this.withAmbientStyle(this.normaliseContent(item.content), ambientStyle));
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
    private resolveTextBoxCommon(ctx: CanvasRenderingContext2D, item: TextBoxInputBase, contentText: string, wasFocused: boolean, wasEditing: boolean): {focusedStyle: ResolvedStateStyle; editingStyle: ResolvedStateStyle; selectionStyle: ResolvedStateStyle; font: string; fontSize: number; height: number; disabled: boolean; width: number; maxFontSize: number} {
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

        // `boxDimensionsFor(0, ...)` isolates the theme's own per-side chrome
        // padding (assumed symmetric), independent of a box's actual width -
        // needed for both the auto-width case below and, at paint time, for
        // insetting the text/caret within a fixed-width box the same way.
        const zeroWidthDims = this.theme.boxDimensionsFor(0, maxFontSize);
        const insetX = zeroWidthDims.w / 2;

        const maxWidth = item.maxWidth ?? this.defaults.numberInputWidth;
        let width: number;
        if (Number.isFinite(maxWidth)) {
            width = maxWidth;
        } else {
            // +3 leaves room for the blinking caret drawn just past the text
            // (see paintTextBox) - without it, a caret sitting at the very
            // end of the content would fall outside the box's clip rect.
            const contentWidth = (measuredWidth ?? this.measureTextWidth(ctx, contentText, this.plainFont)) + insetX * 2 + 3;
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
            height: zeroWidthDims.h,
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
                min: item.min,
                max: item.max,
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
            const {runs: measured, width: labelWidth, maxFontSize: labelFontSize} = this.resolveLine(ctx, this.withAmbientStyle(this.normaliseContent(option.content), ambientStyle));
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
            const resolved = this.resolveLine(ctx, this.withAmbientStyle(this.normaliseContent(selectedOption.content), closedBoxAmbientStyle));
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
                height: this.theme.boxDimensionsFor(maxLabelWidth, closedBoxFontSize).h,
                disabled: item.disabled ?? false,
                width,
            },
            maxFontSize,
        };
    }

    /**
     * Resolves a button's label runs, padded box size, and focused style.
     */
    public resolveButton(ctx: CanvasRenderingContext2D, button: ButtonInput): {element: ResolvedButtonElement; maxFontSize: number} {
        const disabled = button.disabled ?? false;
        const focusIndex = this.nextResolveIndex();
        const wasFocused = this.wasFocusedIndex(focusIndex) && !disabled;
        const segments = this.normaliseContent(button.content);
        const ambientStyle = this.mergeStyle(button.style, wasFocused ? button.focusedStyle : undefined);
        const {runs, width: labelWidth, maxFontSize} = this.resolveLine(ctx, this.withAmbientStyle(segments, ambientStyle));

        const width = labelWidth + this.defaults.buttonPaddingX * 2;
        const height = maxFontSize + this.defaults.buttonPaddingY * 2;

        return {
            element: {kind: "button", runs, onClick: button.onClick, focusedStyle: this.resolveFocusedStyle(button.focusedStyle), fontSize: maxFontSize, disabled, width, height, align: button.align ?? "top"},
            maxFontSize,
        };
    }

    /** Resolves an `interactive: true` top-level text item - focusable/clickable, no box. */
    private resolveInteractiveText(ctx: CanvasRenderingContext2D, item: TextSegment): {element: ResolvedInteractiveTextElement; maxFontSize: number} {
        const disabled = item.disabled ?? false;
        const focusIndex = this.nextResolveIndex();
        const wasFocused = this.wasFocusedIndex(focusIndex) && !disabled;
        const ambientStyle = this.mergeStyle(item.style, wasFocused ? item.focusedStyle : undefined);
        const {runs, width, maxFontSize} = this.resolveLine(ctx, [{content: item.content, style: ambientStyle}]);

        return {
            element: {kind: "interactive-text", runs, onClick: item.onClick ?? (() => undefined), focusedStyle: this.resolveFocusedStyle(item.focusedStyle), fontSize: maxFontSize, disabled, width},
            maxFontSize,
        };
    }

    /** Resolves an {@link HrInput}'s thickness, colour, and `length` mode. `width` stays `0` - {@link resolveHrLengths} patches it in once every row's width is known. */
    private resolveHr(item: HrInput): ResolvedHrElement {
        return {
            kind: "hr",
            width: 0,
            thickness: item.thickness ?? 1,
            color: item.style?.foreground,
            background: item.style?.background,
            length: item.length ?? "max",
        };
    }

    /**
     * Resolves and measures an {@link Input} (any kind but {@link HrInput},
     * which {@link resolveElements} handles separately since it isn't
     * focusable) into its {@link ResolvedInputElement}, dispatching on `kind`.
     */
    private resolveInput(ctx: CanvasRenderingContext2D, item: Exclude<Input, HrInput>): {element: ResolvedInputElement; maxFontSize: number} {
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

    /** This element's own box height before padding/margin: a button/number/textbox/select's own padded `height`, or every other kind's font size. */
    private ownHeight(element: ResolvedElement): number {
        switch (element.kind) {
            case "button":
            case "number":
            case "textbox":
            case "select":
                return element.height;
            default:
                return element.fontSize;
        }
    }

    /** Sum of a resolved spacing's left and right sides. */
    private horizontalSpacing([, right, , left]: ResolvedSpacing): number {
        return left + right;
    }

    /** Sum of a resolved spacing's top and bottom sides. */
    private verticalSpacing([top, , bottom]: ResolvedSpacing): number {
        return top + bottom;
    }

    /** `ownHeight` plus this element's padding and margin, top and bottom - the total vertical space its margin box occupies. */
    private outerHeight(element: ResolvedElement): number {
        return this.ownHeight(element) + this.verticalSpacing(element.padding) + this.verticalSpacing(element.margin);
    }

    /** This element's own content width plus its padding and margin, left and right. */
    private outerWidth(element: ResolvedElement): number {
        return element.width + this.horizontalSpacing(element.padding) + this.horizontalSpacing(element.margin);
    }

    /**
     * Resolves and measures every item in `line` - plain text segments
     * flatten to styled runs; `interactive` text and inputs resolve via
     * {@link resolveInteractiveText}/{@link resolveInput}; an {@link
     * HrInput} resolves via {@link resolveHr} (its bar stays `0` wide until
     * {@link resolveHrLengths} sizes it). A `hidden` item contributes
     * nothing, as if absent. Line height fits the largest font or an
     * element's own outer (padded/margined) height, whichever is taller.
     */
    public resolveElements(ctx: CanvasRenderingContext2D, line: DisplayLine): ResolvedElementLine {
        let width = 0;
        let maxFontSize = 0;
        let maxOuterHeight = 0;

        const items = Array.isArray(line) ? line : line.items;
        const elements: ResolvedElement[] = items.flatMap((item): ResolvedElement[] => {
            const align = item.align ?? "top";
            const padding = resolveSpacing(item.padding);
            const margin = resolveSpacing(item.margin);

            if (isInput(item) && item.kind === "hr") {
                if (item.hidden) {
                    return [];
                }
                const element = this.resolveHr(item);
                maxFontSize = Math.max(maxFontSize, element.thickness);
                const resolved: ResolvedElement = {...element, fontSize: element.thickness, align, padding, margin};
                width += this.outerWidth(resolved);
                maxOuterHeight = Math.max(maxOuterHeight, this.outerHeight(resolved));
                return [resolved];
            }

            if (isInput(item)) {
                if (item.hidden) {
                    return [];
                }
                const {element, maxFontSize: inputFontSize} = this.resolveInput(ctx, item);
                maxFontSize = Math.max(maxFontSize, inputFontSize);
                const resolved: ResolvedElement = {...element, fontSize: inputFontSize, align, padding, margin};
                width += this.outerWidth(resolved);
                maxOuterHeight = Math.max(maxOuterHeight, this.outerHeight(resolved));
                return [resolved];
            }

            if (item.interactive) {
                if (item.hidden) {
                    return [];
                }
                const {element, maxFontSize: textFontSize} = this.resolveInteractiveText(ctx, item);
                maxFontSize = Math.max(maxFontSize, textFontSize);
                const resolved: ResolvedElement = {...element, fontSize: textFontSize, align, padding, margin};
                width += this.outerWidth(resolved);
                maxOuterHeight = Math.max(maxOuterHeight, this.outerHeight(resolved));
                return [resolved];
            }

            const {runs: measured, width: textWidth, maxFontSize: textFontSize} = this.resolveLine(ctx, [item]);
            maxFontSize = Math.max(maxFontSize, textFontSize);
            const resolved: ResolvedElement = {kind: "text", runs: measured, width: textWidth, fontSize: textFontSize, align, padding, margin};
            width += this.outerWidth(resolved);
            maxOuterHeight = Math.max(maxOuterHeight, this.outerHeight(resolved));
            return [resolved];
        });

        return {elements, width, height: Math.max(maxFontSize, maxOuterHeight)};
    }

    /** Picks which neighbouring row's width an hr's bar matches, per its own `length` - `above`/`below` are `undefined` at the first/last row respectively, treated as `0`. */
    private resolveHrReference(length: HrLength, above: number | undefined, below: number | undefined): number {
        switch (length) {
            case "top":
                return above ?? 0;
            case "bottom":
                return below ?? 0;
            case "max":
                return Math.max(above ?? 0, below ?? 0);
        }
    }

    /** Patches every hr's `width` across `rows` in place, per {@link resolveHrReference}. Neighbour widths are snapshotted up front, so two adjacent hrs each see the other's pre-patch (`0`) width. Adjusts each patched row's own `width` total to match. */
    private resolveHrLengths(rows: ResolvedElementLine[]): void {
        const rowWidths = rows.map((row) => row.width);
        rows.forEach((row, i) => {
            for (const element of row.elements) {
                if (element.kind !== "hr") {
                    continue;
                }
                const reference = this.resolveHrReference(element.length, rowWidths[i - 1], rowWidths[i + 1]);
                const barWidth = Math.max(0, reference - this.horizontalSpacing(element.padding));
                row.width += barWidth - element.width;
                element.width = barWidth;
            }
        });
    }

    /** Resolves each of `lines` via {@link resolveElements}, then sizes every hr's bar against its neighbouring row(s) via {@link resolveHrLengths} - plus the widest row's width and every row's height summed (`lineSpacing` apart). */
    public resolveLines(ctx: CanvasRenderingContext2D, lines: DisplayLine[], lineSpacing: number): {rows: ResolvedElementLine[]; width: number; height: number} {
        const rows = lines.map((line) => this.resolveElements(ctx, line));
        this.resolveHrLengths(rows);
        const width = Math.max(0, ...rows.map((row) => row.width));
        const height = rows.reduce((sum, row) => sum + row.height, 0) + lineSpacing * Math.max(rows.length - 1, 0);
        return {rows, width, height};
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

    /** Draws a resolved hr element's `background` (if set) across its content+padding rect, then its bar: `element.color` as a flat fill when set, otherwise the active theme's own `drawLine` (e.g. Win98's bevelled groove). */
    private paintHr(ctx: CanvasRenderingContext2D, element: ResolvedHrElement, x: number, y: number, padding: ResolvedSpacing): void {
        if (element.background) {
            const rect = expandRect({x, y, w: element.width, h: element.thickness}, padding);
            ctx.fillStyle = element.background;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        if (element.color) {
            ctx.fillStyle = element.color;
            ctx.fillRect(x, y, element.width, element.thickness);
        } else {
            const midY = y + element.thickness / 2;
            this.theme.drawLine(ctx, x, midY, x + element.width, midY, element.thickness);
        }
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

    /** An option's own outer height: its label font size plus its own padding and margin, top and bottom - mirrors {@link outerHeight} one level down. */
    private radioOptionOuterHeight(option: ResolvedRadioOption): number {
        return option.fontSize + this.verticalSpacing(option.padding) + this.verticalSpacing(option.margin);
    }

    /** The radio group's own natural height: the tallest option's own outer height - used as the box each option's own `align` positions itself within. */
    private radioOwnHeight(element: ResolvedRadioElement): number {
        return Math.max(0, ...element.options.map((option) => this.radioOptionOuterHeight(option)));
    }

    /** Computes a resolved radio element's options' on-screen rects, walking left-to-right from `x`. Each option is its own nested box: `align` positions its outer (padding+margin) box within the radio's own natural height, and its own `margin` then `padding` shift its content in from there, mirroring {@link contentPosition} one level down - independent of the radio input's own padding/margin, already spent getting to `x`/`y`. */
    private layoutRadio(element: ResolvedRadioElement, x: number, y: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        const ownHeight = this.radioOwnHeight(element);
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            const outerY = y + this.verticalOffset(option.align, this.radioOptionOuterHeight(option), ownHeight);
            const {x: tightX, y: tightY} = this.contentPosition(elemX, outerY, option.padding, option.margin);
            const rect = expandRect({x: tightX, y: tightY, w: optionWidth, h: option.fontSize}, option.padding);
            focusables.push({rect, activate: () => option.onSelect(option.key), disabled: option.disabled});
            elemX += optionWidth + this.horizontalSpacing(option.padding) + this.horizontalSpacing(option.margin);
        });
        return focusables;
    }

    /** Draws a resolved radio element's marker circle plus label per option, walking left-to-right from `x`. Each option is its own nested box, positioned the same way as {@link layoutRadio}. */
    private paintRadio(ctx: CanvasRenderingContext2D, element: ResolvedRadioElement, x: number, y: number, focusedRect: BoundingRect | null): void {
        const ownHeight = this.radioOwnHeight(element);
        let elemX = x;
        element.options.forEach((option, i) => {
            if (i > 0) {
                elemX += this.defaults.radioOptionGap;
            }
            const optionWidth = this.radioOptionContentWidth(option.labelWidth);
            const outerY = y + this.verticalOffset(option.align, this.radioOptionOuterHeight(option), ownHeight);
            const {x: tightX, y: tightY} = this.contentPosition(elemX, outerY, option.padding, option.margin);
            const highlightRect: BoundingRect = {x: tightX, y: tightY, w: optionWidth, h: option.fontSize};
            const rect = expandRect(highlightRect, option.padding);
            const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !option.disabled;
            const active = focused ? option.focusedStyle : (option.selected ? option.selectedStyle : null);
            const markerStyle = option.selected ? option.inputSelectedStyle : option.inputStyle;

            if (active?.background) {
                ctx.fillStyle = active.background;
                ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            }

            const markerRadius = this.defaults.radioMarkerSize / 2;
            const markerCx = tightX + markerRadius;
            const markerCy = highlightRect.y + highlightRect.h / 2;
            this.theme.drawRadioMarker(ctx, markerCx, markerCy, markerRadius, option.selected, markerStyle.foreground, markerStyle.background);

            const labelX = tightX + this.defaults.radioMarkerSize + this.defaults.radioMarkerGap;
            this.drawLine(ctx, option.labelRuns, labelX, tightY, option.fontSize, active?.foreground);

            if (option.disabled) {
                this.paintDisabledCircleOverlay(ctx, markerCx, markerCy, markerRadius);
            }

            this.strokeDebugRect(ctx, highlightRect, CONTENT_DEBUG_COLOR);

            elemX += optionWidth + this.horizontalSpacing(option.padding) + this.horizontalSpacing(option.margin);
        });
    }

    /** Computes a resolved checkbox element's on-screen rect. It activates by invoking `onToggle` with its flipped checked state. */
    private layoutCheckbox(element: ResolvedCheckboxElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        const rect = expandRect({x, y, w: element.width, h: element.fontSize}, padding);
        return [{rect, activate: () => element.onToggle(!element.checked), disabled: element.disabled}];
    }

    /** Draws a resolved checkbox element's box plus label at `x`. `padding` matches {@link layoutCheckbox}'s rect, for focus comparison. */
    private paintCheckbox(ctx: CanvasRenderingContext2D, element: ResolvedCheckboxElement, x: number, y: number, focusedRect: BoundingRect | null, padding: ResolvedSpacing): void {
        const highlightRect: BoundingRect = {x, y, w: element.width, h: element.fontSize};
        const rect = expandRect(highlightRect, padding);
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;
        const active = focused ? element.focusedStyle : (element.checked ? element.selectedStyle : null);
        const boxStyle = element.checked ? element.inputSelectedStyle : element.inputStyle;

        if (active?.background) {
            ctx.fillStyle = active.background;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        this.drawCheckboxBox(ctx, highlightRect, this.defaults.checkboxSize, element.checked, boxStyle);

        const labelX = x + this.defaults.checkboxSize + this.defaults.checkboxGap;
        this.drawLine(ctx, element.labelRuns, labelX, y, element.fontSize, active?.foreground);

        if (element.disabled) {
            const boxY = this.centeredBoxY(highlightRect, this.defaults.checkboxSize);
            this.paintDisabledOverlay(ctx, {x, y: boxY, w: this.defaults.checkboxSize, h: this.defaults.checkboxSize});
        }

        this.strokeDebugRect(ctx, highlightRect, CONTENT_DEBUG_COLOR);
    }

    /** Computes a number input's or textbox's on-screen rect - identical for both, differing only in which edit handle is attached. */
    private layoutTextBoxFocusable(x: number, y: number, width: number, ownHeight: number, padding: ResolvedSpacing, disabled: boolean, edit: Pick<FocusableElement, "numberEdit"> | Pick<FocusableElement, "textEdit">): FocusableElement[] {
        return [{
            rect: expandRect({x, y, w: width, h: ownHeight}, padding),
            activate: () => undefined,
            disabled,
            ...edit,
        }];
    }

    /** Computes a resolved number element's on-screen rect. */
    private layoutNumber(element: ResolvedNumberElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        return this.layoutTextBoxFocusable(x, y, element.width, element.height, padding, element.disabled, {
            numberEdit: {getValue: () => element.value, step: element.step, allowDecimal: element.allowDecimal, min: element.min, max: element.max, onChange: element.onChange},
        });
    }

    /** Computes a resolved textbox element's on-screen rect. */
    private layoutTextbox(element: ResolvedTextboxElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        return this.layoutTextBoxFocusable(x, y, element.width, element.height, padding, element.disabled, {
            textEdit: {getValue: () => element.value, allowedChars: element.allowedChars, disallowedChars: element.disallowedChars, onChange: element.onChange},
        });
    }

    /** Whether a blinking edit cursor should currently be drawn, per this display's cursor-blink interval. */
    private isCursorBlinkVisible(): boolean {
        return Math.floor(Date.now() / this.defaults.cursorBlinkIntervalMs) % 2 === 0;
    }

    /** Shared paint core for {@link paintNumber}/{@link paintTextbox}: draws the sunken box, its text, and any edit selection at `x`, in `font`. `elementPadding` (matching {@link layoutTextBoxFocusable}'s rect) grows the drawn box outward around the tight `x`/`y`/`width`/`height` content, insetting the text; the scroll/clip region extends to the grown box's edge, so more text is visible. */
    private paintTextBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, focusedStyle: ResolvedStateStyle, editingStyle: ResolvedStateStyle, disabled: boolean, focusedRect: BoundingRect | null, text: string, editing: boolean, editCursorPos: number | null, editSelection: {start: number; end: number} | null, selectionStyle: ResolvedStateStyle, font: string, fontSize: number, height: number, elementPadding: ResolvedSpacing): void {
        const rect = expandRect({x, y, w: width, h: height}, elementPadding);
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !disabled;

        const boxX = rect.x;
        const boxY = rect.y;
        const boxWidth = rect.w;
        const boxHeight = rect.h;
        const inset = (height - fontSize) / 2;

        // focusedStyle's background is a halo, shown whenever focused (editing too).
        if (focused && focusedStyle.background) {
            const pad = this.defaults.focusHighlightPadding;
            ctx.fillStyle = focusedStyle.background;
            ctx.fillRect(boxX - pad, boxY - pad, boxWidth + pad * 2, boxHeight + pad * 2);
        }

        this.theme.drawBox(ctx, boxX, boxY, boxWidth, boxHeight, "sunken");

        if (editing && editingStyle.background) {
            this.fillBoxInterior(ctx, boxX, boxY, boxWidth, boxHeight, editingStyle.background);
        }

        const textColor = editing ? (editingStyle.foreground ?? this.theme.boxForeground) : this.theme.boxForeground;

        ctx.font = font;
        const padding = this.theme.boxDimensionsFor(0, fontSize).w / 2;
        // x/y, not boxX/boxY - the text stays put, so the grown box insets it.
        const textX = x + padding;
        const textY = y + inset;
        const innerWidth = Math.max(0, boxX + boxWidth - padding - textX);

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
            ctx.fillRect(textX - scrollX + selStartX, textY, selEndX - selStartX, fontSize);

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
            ctx.fillRect(textX - scrollX + caretX + 1, textY, 1, fontSize);
        }

        ctx.restore();

        if (disabled) {
            this.paintDisabledOverlay(ctx, {x: boxX, y: boxY, w: boxWidth, h: boxHeight});
        }

        this.strokeDebugRect(ctx, {x: boxX, y: boxY, w: boxWidth, h: boxHeight}, CONTENT_DEBUG_COLOR);
    }

    /** Draws a resolved number element's box at `x`; `value` is stringified for display. `padding` matches {@link layoutNumber}'s rect, for focus comparison. */
    private paintNumber(ctx: CanvasRenderingContext2D, element: ResolvedNumberElement, x: number, y: number, focusedRect: BoundingRect | null, editText: string | null, editCursorPos: number | null, editSelection: {start: number; end: number} | null, padding: ResolvedSpacing): void {
        const focused = focusedRect !== null && rectsEqual(expandRect({x, y, w: element.width, h: element.height}, padding), focusedRect) && !element.disabled;
        const editing = focused && editText !== null;
        const text = editing ? editText : String(element.value);
        this.paintTextBox(ctx, x, y, element.width, element.focusedStyle, element.editingStyle, element.disabled, focusedRect, text, editing, editCursorPos, editSelection, element.selectionStyle, element.font, element.fontSize, element.height, padding);
    }

    /** Draws a resolved textbox element's box at `x`; the value is shown as-is. `padding` matches {@link layoutTextbox}'s rect, for focus comparison. */
    private paintTextbox(ctx: CanvasRenderingContext2D, element: ResolvedTextboxElement, x: number, y: number, focusedRect: BoundingRect | null, editText: string | null, editCursorPos: number | null, editSelection: {start: number; end: number} | null, padding: ResolvedSpacing): void {
        const focused = focusedRect !== null && rectsEqual(expandRect({x, y, w: element.width, h: element.height}, padding), focusedRect) && !element.disabled;
        const editing = focused && editText !== null;
        const text = editing ? editText : element.value;
        this.paintTextBox(ctx, x, y, element.width, element.focusedStyle, element.editingStyle, element.disabled, focusedRect, text, editing, editCursorPos, editSelection, element.selectionStyle, element.font, element.fontSize, element.height, padding);
    }

    /** Computes a resolved button's on-screen rect at its own fixed size - `x`/`y` are already its final box origin (see {@link verticalOffset} for standalone alignment). */
    private layoutButtonBox(element: ResolvedButtonElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        const rect = expandRect({x, y, w: element.width, h: element.height}, padding);
        return [{rect, activate: element.onClick, disabled: element.disabled, pressable: true}];
    }

    /** Computes a standalone resolved button's on-screen rect (e.g. a popup's footer row): fixed-size box, positioned within `height` per `element.align`. Not part of a {@link DisplayLine}, so no padding/margin. */
    public layoutButton(element: ResolvedButtonElement, x: number, y: number, height: number): FocusableElement[] {
        const boxY = y + this.verticalOffset(element.align, element.height, height);
        return this.layoutButtonBox(element, x, boxY, ZERO_SPACING);
    }

    /** Draws a resolved button's bevelled box and label, padding included - `x`/`y` are its tight content origin; `padding` (matching {@link layoutButtonBox}'s rect) grows the drawn box outward from there, so the box itself (not just its clickable bounds) gets bigger. Raised at rest, sunken while `pressedRect` matches, highlighted when `focusedRect` matches. */
    private paintButtonBox(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, focusedRect: BoundingRect | null, pressedRect: BoundingRect | null, padding: ResolvedSpacing): void {
        const rect = expandRect({x, y, w: element.width, h: element.height}, padding);
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;
        const pressed = pressedRect !== null && rectsEqual(rect, pressedRect) && !element.disabled;

        this.theme.drawButtonBox(ctx, rect.x, rect.y, rect.w, rect.h, pressed);
        this.theme.drawButtonFocus(ctx, rect.x, rect.y, rect.w, rect.h, focused ? element.focusedStyle : {foreground: undefined, background: undefined});

        const offset = pressed ? this.defaults.buttonPressedTextOffset : 0;
        const labelHeight = element.fontSize;
        const labelWidth = element.width - this.defaults.buttonPaddingX * 2;
        // x/y, not rect.x/rect.y - the label stays put, so padding growing the box around it is what insets it.
        const textX = x + this.defaults.buttonPaddingX + offset;
        const textY = y + this.defaults.buttonPaddingY + offset;
        this.drawLine(ctx, element.runs, textX, textY, labelHeight, focused ? element.focusedStyle.foreground : undefined);
        this.strokeDebugRect(ctx, {x: textX, y: textY, w: labelWidth, h: labelHeight}, CONTENT_DEBUG_COLOR);

        if (element.disabled) {
            this.paintDisabledOverlay(ctx, rect);
        }
    }

    /** Draws a standalone resolved button (e.g. a popup's footer row), reading this display's own focus/press state. Not part of a {@link DisplayLine}, so no padding/margin. */
    public drawButton(ctx: CanvasRenderingContext2D, element: ResolvedButtonElement, x: number, y: number, height: number): void {
        const boxY = y + this.verticalOffset(element.align, element.height, height);
        this.paintButtonBox(ctx, element, x, boxY, this.getFocusedRect(), this.getPressedRect(), ZERO_SPACING);
    }

    /** Computes an interactive-text element's on-screen rect. */
    private layoutInteractiveText(element: ResolvedInteractiveTextElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        const rect = expandRect({x, y, w: element.width, h: element.fontSize}, padding);
        return [{rect, activate: element.onClick, disabled: element.disabled, pressable: true}];
    }

    /** Draws an interactive-text element's runs, with the same focus/press overlay a button gets, but no box. `padding` matches {@link layoutInteractiveText}'s rect, for focus/press comparison. */
    private paintInteractiveText(ctx: CanvasRenderingContext2D, element: ResolvedInteractiveTextElement, x: number, y: number, focusedRect: BoundingRect | null, pressedRect: BoundingRect | null, padding: ResolvedSpacing): void {
        const rect = expandRect({x, y, w: element.width, h: element.fontSize}, padding);
        const focused = focusedRect !== null && rectsEqual(rect, focusedRect) && !element.disabled;
        const pressed = pressedRect !== null && rectsEqual(rect, pressedRect) && !element.disabled;
        const active = (focused || pressed) ? element.focusedStyle : null;

        if (active?.background) {
            ctx.fillStyle = active.background;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        this.drawLine(ctx, element.runs, x, y, element.fontSize, active?.foreground);
        this.strokeDebugRect(ctx, {x, y, w: element.width, h: element.fontSize}, CONTENT_DEBUG_COLOR);
    }

    /** The closed box's own visual rect - `{x, y}` is the tight content origin; `padding` (matching {@link layoutSelect}'s rect) grows the box outward from there, same as a button/textbox. `paintSelect` and the dropdown both anchor off this, not the coarser line-height focusable rect. */
    private selectBoxRect(element: ResolvedSelectElement, x: number, y: number, padding: ResolvedSpacing): BoundingRect {
        return expandRect({x, y, w: element.width, h: element.height}, padding);
    }

    /** Computes a resolved select element's on-screen rect. It opens via {@link handleKeyDown}/clicking, not `activate`. */
    private layoutSelect(element: ResolvedSelectElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        return [{
            rect: expandRect({x, y, w: element.width, h: element.rowFontSize}, padding),
            activate: () => undefined,
            selectEdit: {
                options: element.options,
                selectedKey: element.options[element.selectedIndex]?.key ?? "",
                onSelect: element.onSelect,
                rowAmbientStyle: element.rowAmbientStyle,
                rowHeight: element.rowFontSize,
                boxRect: this.selectBoxRect(element, x, y, padding),
            },
            disabled: element.disabled,
        }];
    }

    /** Draws a resolved select element's closed combo box: a themed box (padding included, so the box itself gets bigger, not just its clickable bounds) showing the selected option's label, plus a dropdown-arrow button. `padding` matches {@link layoutSelect}'s rect, for focus/open comparison. */
    private paintSelect(ctx: CanvasRenderingContext2D, element: ResolvedSelectElement, x: number, y: number, focusedRect: BoundingRect | null, open: boolean, padding: ResolvedSpacing): void {
        const rowRect = expandRect({x, y, w: element.width, h: element.rowFontSize}, padding);
        const focused = focusedRect !== null && rectsEqual(rowRect, focusedRect) && !element.disabled;

        const selected = element.options[element.selectedIndex];
        const {x: boxX, y: boxY, w: boxWidth, h: boxHeight} = this.selectBoxRect(element, x, y, padding);
        const arrowWidth = this.defaults.selectArrowWidth;
        const textBoxWidth = boxWidth - arrowWidth;

        const stateStyle = open ? element.expandedStyle : (focused ? element.focusedStyle : null);
        const foreground = selected?.selectedStyle?.foreground ?? stateStyle?.foreground;
        const background = selected?.selectedStyle?.background ?? stateStyle?.background;

        this.theme.drawBox(ctx, boxX, boxY, textBoxWidth, boxHeight, "sunken");

        if (background) {
            this.fillBoxInterior(ctx, boxX, boxY, textBoxWidth, boxHeight, background);
        }

        if (selected) {
            // x/y, not boxX/boxY - the label stays put, so the grown box insets it.
            this.drawLine(ctx, element.closedBoxLabelRuns, x + this.defaults.selectPadding, y, boxHeight, foreground);
        }

        this.theme.drawSelectArrowButton(ctx, boxX + textBoxWidth, boxY, arrowWidth, boxHeight, open);

        if (element.disabled) {
            this.paintDisabledOverlay(ctx, {x: boxX, y: boxY, w: boxWidth, h: boxHeight});
        }

        this.strokeDebugRect(ctx, {x: boxX, y: boxY, w: boxWidth, h: boxHeight}, CONTENT_DEBUG_COLOR);
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
     * Draws the currently-open select input's dropdown, if any, on top of
     * everything else - see {@link drawOverlays}. A no-op if no select is
     * open.
     */
    private drawOpenSelectDropdown(ctx: CanvasRenderingContext2D): void {
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

    /** Outlines every current focusable's coarse click/keyboard-nav rect, when {@link setDebug} is on - see {@link drawOverlays}. Separate from each element's own content/padding/margin rings (see {@link strokeSpacingDebugRects}) - green for an enabled focusable, red for a disabled one. */
    private drawDebugBounds(ctx: CanvasRenderingContext2D): void {
        if (!this.debug) {
            return;
        }
        for (const focusable of this.focusables) {
            this.strokeDebugRect(ctx, focusable.rect, this.debugRectColor(focusable.disabled));
        }
    }

    /** Draws every trailing, content-independent overlay - the open select's dropdown, then debug bounds. Call once, last, after a frame's own content is drawn. Safe to call unconditionally: each overlay is a no-op when it has nothing to draw. */
    public drawOverlays(ctx: CanvasRenderingContext2D): void {
        this.drawOpenSelectDropdown(ctx);
        this.drawDebugBounds(ctx);
    }

    /** Focusable-rect debug colour: green for an enabled focusable, red for a disabled one. */
    private debugRectColor(disabled: boolean): string {
        return disabled ? "red" : "lime";
    }

    /** Outlines `rect` in `color`, only when {@link setDebug} is on. */
    private strokeDebugRect(ctx: CanvasRenderingContext2D, rect: BoundingRect, color: string): void {
        if (!this.debug) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
        ctx.restore();
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
     * The bounding rect of everything this display currently occupies -
     * every focusable plus any open select's dropdown. Unrelated to {@link
     * setClickRegion}'s click region.
     */
    public getOccupiedBounds(): BoundingRect | null {
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

    /** Computes a resolved focusable element's focusable rects, dispatching on `kind`. `x`/`y` are already this element's content origin (see {@link contentPosition}); `padding` grows the returned rect(s) into the clickable/focusable bounds. */
    private layoutInput(element: ResolvedFocusableElement, x: number, y: number, padding: ResolvedSpacing): FocusableElement[] {
        switch (element.kind) {
            case "radio":
                return this.layoutRadio(element, x, y);
            case "checkbox":
                return this.layoutCheckbox(element, x, y, padding);
            case "number":
                return this.layoutNumber(element, x, y, padding);
            case "textbox":
                return this.layoutTextbox(element, x, y, padding);
            case "button":
                return this.layoutButtonBox(element, x, y, padding);
            case "select":
                return this.layoutSelect(element, x, y, padding);
            case "interactive-text":
                return this.layoutInteractiveText(element, x, y, padding);
        }
    }

    /** Draws a resolved focusable element, dispatching on `kind`. `x`/`y` are already this element's content origin; `padding` matches {@link layoutInput}'s rect, for focus/press/open comparison. */
    private paintInput(
        ctx: CanvasRenderingContext2D,
        element: ResolvedFocusableElement,
        x: number,
        y: number,
        focusedRect: BoundingRect | null,
        pressedRect: BoundingRect | null,
        editText: string | null,
        editCursorPos: number | null,
        editSelection: {start: number; end: number} | null,
        openRect: BoundingRect | null,
        padding: ResolvedSpacing,
    ): void {
        switch (element.kind) {
            case "radio":
                this.paintRadio(ctx, element, x, y, focusedRect);
                break;
            case "checkbox":
                this.paintCheckbox(ctx, element, x, y, focusedRect, padding);
                break;
            case "number":
                this.paintNumber(ctx, element, x, y, focusedRect, editText, editCursorPos, editSelection, padding);
                break;
            case "textbox":
                this.paintTextbox(ctx, element, x, y, focusedRect, editText, editCursorPos, editSelection, padding);
                break;
            case "button":
                this.paintButtonBox(ctx, element, x, y, focusedRect, pressedRect, padding);
                break;
            case "select":
                this.paintSelect(ctx, element, x, y, focusedRect, openRect !== null && rectsEqual(expandRect({x, y, w: element.width, h: element.rowFontSize}, padding), openRect), padding);
                break;
            case "interactive-text":
                this.paintInteractiveText(ctx, element, x, y, focusedRect, pressedRect, padding);
                break;
        }
    }

    /** Offset from a container's top for a box of `ownHeight` positioned within `containerHeight`, per `align`. */
    private verticalOffset(align: Alignment, ownHeight: number, containerHeight: number): number {
        switch (align) {
            case "centre":
                return (containerHeight - ownHeight) / 2;
            case "bottom":
                return containerHeight - ownHeight;
            default:
                return 0;
        }
    }

    /** This element's content origin: `(x, y)` shifted inward by its margin then padding - the box grows back outward from there. */
    private contentPosition(x: number, y: number, padding: ResolvedSpacing, margin: ResolvedSpacing): {x: number; y: number} {
        const [paddingTop, , , paddingLeft] = padding;
        const [marginTop, , , marginLeft] = margin;
        return {x: x + marginLeft + paddingLeft, y: y + marginTop + paddingTop};
    }

    /**
     * Draws padding/margin debug rings around `contentRect`, when {@link
     * setDebug} is on and the respective spacing is non-zero - red for the
     * padding box, magenta for the margin box, like a DevTools box-model
     * overlay. Must be called before the element's own content/content-rect
     * painting, so that drawing paints over these rings wherever they'd
     * otherwise coincide (e.g. zero padding), letting the content rect
     * always win visually.
     */
    private strokeSpacingDebugRects(ctx: CanvasRenderingContext2D, contentRect: BoundingRect, padding: ResolvedSpacing, margin: ResolvedSpacing): void {
        const paddingRect = expandRect(contentRect, padding);
        if (!rectsEqual(paddingRect, contentRect)) {
            this.strokeDebugRect(ctx, paddingRect, "red");
        }
        const marginRect = expandRect(paddingRect, margin);
        if (!rectsEqual(marginRect, paddingRect)) {
            this.strokeDebugRect(ctx, marginRect, "magenta");
        }
    }

    /**
     * Computes one resolved line's input focusable rects, walking
     * left-to-right from `x`, exactly as {@link drawElements} draws them.
     * Each element's `align` positions its outer (padding+margin) box within
     * the line's height, and `margin` then `padding` shift its content in
     * from there - see {@link contentPosition}.
     */
    public layoutFocusables(line: ResolvedElementLine, x: number, y: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        let elemX = x;
        for (const element of line.elements) {
            const elemY = y + this.verticalOffset(element.align, this.outerHeight(element), line.height);
            const {x: contentX, y: contentY} = this.contentPosition(elemX, elemY, element.padding, element.margin);
            if (element.kind !== "text" && element.kind !== "hr") {
                focusables.push(...this.layoutInput(element, contentX, contentY, element.padding));
            }
            elemX += this.outerWidth(element);
        }
        return focusables;
    }

    /** Lays out every row's focusables top to bottom from `(x, y)` via {@link layoutFocusables}, `lineSpacing` apart. Doesn't call {@link setFocusables} - callers merging multiple stacks (e.g. a popup's lines plus its buttons) do that themselves. */
    public layoutLineFocusables(rows: ResolvedElementLine[], x: number, y: number, lineSpacing: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        let lineY = y;
        for (const row of rows) {
            focusables.push(...this.layoutFocusables(row, x, lineY));
            lineY += row.height + lineSpacing;
        }
        return focusables;
    }

    /**
     * Draws a resolved line's elements left-to-right from `x`: plain text
     * runs as-is, inputs via {@link paintInput} - reading this display's own
     * focus/edit/open-dropdown state. Also draws each element's padding/
     * margin debug rings - see {@link strokeSpacingDebugRects}.
     */
    public drawElements(ctx: CanvasRenderingContext2D, line: ResolvedElementLine, x: number, y: number): void {
        const focusedRect = this.getFocusedRect();
        const pressedRect = this.getPressedRect();
        const editText = this.getEditText();
        const editCursorPos = this.getEditCursorPos();
        const editSelection = this.getEditSelection();
        const openRect = this.getOpenRect();

        let elemX = x;
        for (const element of line.elements) {
            const elemY = y + this.verticalOffset(element.align, this.outerHeight(element), line.height);
            const {x: contentX, y: contentY} = this.contentPosition(elemX, elemY, element.padding, element.margin);
            this.strokeSpacingDebugRects(ctx, {x: contentX, y: contentY, w: element.width, h: this.ownHeight(element)}, element.padding, element.margin);
            if (element.kind === "text") {
                this.drawLine(ctx, element.runs, contentX, contentY, element.fontSize);
                this.strokeDebugRect(ctx, {x: contentX, y: contentY, w: element.width, h: element.fontSize}, CONTENT_DEBUG_COLOR);
            } else if (element.kind === "hr") {
                this.paintHr(ctx, element, contentX, contentY, element.padding);
            } else {
                this.paintInput(ctx, element, contentX, contentY, focusedRect, pressedRect, editText, editCursorPos, editSelection, openRect, element.padding);
            }
            elemX += this.outerWidth(element);
        }
    }

    /** Draws every row top to bottom from `(x, y)`, via {@link drawElements}, `lineSpacing` apart. */
    public drawLines(ctx: CanvasRenderingContext2D, rows: ResolvedElementLine[], x: number, y: number, lineSpacing: number): void {
        let lineY = y;
        for (const row of rows) {
            this.drawElements(ctx, row, x, lineY);
            lineY += row.height + lineSpacing;
        }
    }

    /** Merges multiple focusable groups (e.g. a popup's lines plus its footer buttons) into the single top-down, then left-to-right order {@link setFocusables} expects. */
    public mergeFocusables(...groups: FocusableElement[][]): FocusableElement[] {
        return groups.flat().sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    }

    /**
     * Replaces the full set of focusable elements this frame - every input
     * across every line, plus any standalone buttons (e.g. a popup's footer
     * row), sorted into the order the cursor should navigate them in
     * (top-down, then left-to-right) - see {@link mergeFocusables}. Clamps
     * the cursor and clears any stale open-select/editing-number state that
     * no longer matches.
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
        if (this.mousePressedIndex !== null && (this.mousePressedIndex >= this.focusables.length || !this.focusables[this.mousePressedIndex].pressable)) {
            this.mousePressedIndex = null;
        }
        if (this.keyboardPressedIndex !== null && (this.keyboardPressedIndex >= this.focusables.length || !this.focusables[this.keyboardPressedIndex].pressable)) {
            this.keyboardPressedIndex = null;
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

    /** The currently pressed `pressable` element's rect, if any - mouse takes priority over a keyboard-held `Enter`/`Space`. */
    private getPressedRect(): BoundingRect | null {
        if (this.mousePressedIndex !== null) {
            return this.focusables[this.mousePressedIndex]?.rect ?? null;
        }
        if (this.keyboardPressedIndex !== null) {
            return this.focusables[this.keyboardPressedIndex]?.rect ?? null;
        }
        return null;
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
        this.keyboardPressedIndex = null;
        this.cursor = cursor;
    }

    /** Clamps `value` to `[min, max)` - `max` is exclusive, so a value that would reach or exceed it is pulled back by `step` instead, keeping it on the same step grid. Either bound is skipped when unset. */
    private clampNumberValue(value: number, min: number | undefined, max: number | undefined, step: number): number {
        let result = value;
        if (max !== undefined && result >= max) {
            result = max - step;
        }
        if (min !== undefined) {
            result = Math.max(result, min);
        }
        return result;
    }

    /**
     * If {@link numberEditBuffer} holds an edit for the currently focused
     * element, parses it and calls that number input's `onChange` with the
     * result (clamped to `min`/`max`), then clears the buffer either way.
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
        const next = Number.isNaN(parsed) ? numberEdit.getValue() : parsed;
        numberEdit.onChange(this.clampNumberValue(next, numberEdit.min, numberEdit.max, numberEdit.step));
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
     * @param acceptsChar - Whether `char` may be inserted (typed or pasted), given `textWithoutChar` - the buffer's text with any active selection (or, mid-paste, everything already accepted from earlier in the pasted string) removed - and `insertAt`, the index within it `char` would land at. E.g. a number input rejects a second `.`, or a `-` anywhere but `insertAt === 0`.
     * @param isStillEditing - Forwarded to {@link handleClipboardShortcut}.
     * @param setBuffer - Applies the buffer's next value.
     */
    private handleTextEditingKey(
        cursor: number,
        currentText: string,
        pos: number,
        anchor: number | null,
        event: KeyboardEvent,
        acceptsChar: (char: string, textWithoutChar: string, insertAt: number) => boolean,
        isStillEditing: () => boolean,
        setBuffer: (buffer: {cursor: number; text: string; pos: number; anchor: number | null}) => void,
    ): void {
        if (this.handleClipboardShortcut(
            cursor, currentText, pos, anchor, event,
            (pasted) => {
                const selection = anchor !== null && anchor !== pos ? {start: Math.min(pos, anchor), end: Math.max(pos, anchor)} : null;
                let building = selection ? currentText.slice(0, selection.start) + currentText.slice(selection.end) : currentText;
                let insertAt = selection ? selection.start : pos;
                let accepted = "";
                for (const char of pasted) {
                    if (acceptsChar(char, building, insertAt)) {
                        accepted += char;
                        building += char;
                        insertAt += 1;
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
        } else if (event.key.length === 1 && acceptsChar(event.key, textWithoutSelection, selection ? selection.start : pos)) {
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
            const next = this.clampNumberValue(this.getEffectiveNumberValue(cursor, numberEdit) + delta, numberEdit.min, numberEdit.max, numberEdit.step);
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
            (char, textWithoutChar, insertAt) => /^[0-9]$/.test(char)
                || (char === "." && numberEdit.allowDecimal && !textWithoutChar.includes("."))
                || (char === "-" && insertAt === 0 && !textWithoutChar.startsWith("-")),
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
        } else if (cursor !== null && focusedNumberEdit && event.key === "-" && focusedNumberEdit.getValue() >= 0) {
            this.startEditingNumber(cursor, focusedNumberEdit, "-" + String(focusedNumberEdit.getValue()));
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
            } else if (focusable.pressable) {
                // activate() deferred to handleKeyUp - see keyboardPressedIndex.
                this.keyboardPressedIndex = this.cursor;
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
        const focused = this.isFocused();
        const aboutToFocus = !focused && this.focusMode === "click" && this.clickRegion !== null && pointInRect(event.clientX, event.clientY, this.clickRegion);
        if (!focused && !aboutToFocus) {
            return;
        }
        event.stopPropagation();

        const index = this.focusables.findIndex((focusable) => pointInRect(event.clientX, event.clientY, focusable.rect));
        if (index !== -1 && this.focusables[index].pressable && !this.focusables[index].disabled) {
            this.mousePressedIndex = index;
        }
    };

    /** Clears {@link mousePressedIndex} on release. */
    private readonly handleMouseUp = (): void => {
        this.mousePressedIndex = null;
    };

    /** Fires the deferred `activate()` for {@link keyboardPressedIndex} on `Enter`/`Space` release. */
    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        const index = this.keyboardPressedIndex;
        this.keyboardPressedIndex = null;
        if (index === null) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const focusable = this.focusables[index];
        if (focusable && !focusable.disabled) {
            focusable.activate();
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

        if (this.focusMode === "click" && this.clickRegion && !pointInRect(event.clientX, event.clientY, this.clickRegion)) {
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
