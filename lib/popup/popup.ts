import {ButtonInput, DisplayLine} from "@display/input";
import {FocusableElement, InteractableDisplay, InteractableDisplayDefaults, ResolvedButtonElement} from "@display/interactable-display";
import {WIN98_THEME} from "@display/win98-theme";
import {POPUP_CONFIG} from "./popup-config";
import {BoundingRect, rectContains, unionRect} from "@display/bounding-rect";

/** Configures a {@link Popup} at construction. */
export interface PopupOptions {
    /**
     * Keys that close the popup outright (bypassing button selection)
     * whenever it's open. Defaults to `["Escape"]`.
     */
    closeKeys?: string[];

    /**
     * Called whenever this popup opens or closes, e.g. so a caller can pause
     * the game while it's open. `open` is `true` on open, `false` on close.
     */
    onOpenChange?: (open: boolean) => void;
}

/** Text/input geometry every {@link Popup} shares, built from {@link POPUP_CONFIG}. */
const INTERACTABLE_DEFAULTS: InteractableDisplayDefaults = {
    foreground: POPUP_CONFIG.textColor,
    fontFamily: POPUP_CONFIG.fontFamily,
    fontSize: POPUP_CONFIG.fontSize,
    radioMarkerSize: POPUP_CONFIG.radioMarkerSize,
    radioMarkerGap: POPUP_CONFIG.radioMarkerGap,
    radioOptionGap: POPUP_CONFIG.radioOptionGap,
    checkboxSize: POPUP_CONFIG.checkboxSize,
    checkboxGap: POPUP_CONFIG.checkboxGap,
    numberInputWidth: POPUP_CONFIG.numberInputWidth,
    cursorBlinkIntervalMs: POPUP_CONFIG.cursorBlinkIntervalMs,
    selectPadding: POPUP_CONFIG.selectPadding,
    selectArrowWidth: POPUP_CONFIG.selectArrowWidth,
    focusHighlightPadding: POPUP_CONFIG.focusHighlightPadding,
    buttonPaddingX: POPUP_CONFIG.buttonPaddingX,
    buttonPaddingY: POPUP_CONFIG.buttonPaddingY,
    buttonPressedTextOffset: POPUP_CONFIG.buttonPressedTextOffset,
    disabledOverlayColor: POPUP_CONFIG.disabledOverlayColor,
};

/**
 * A generic modal popup: a title, some lines of text, and a row of buttons
 * navigated by a keyboard cursor or clicked directly. While open, it takes
 * over the keyboard and mouse entirely, so nothing behind it reacts to input
 * until it's closed. Call {@link drawOverlay} once on open, and {@link draw}
 * every frame, to render it.
 */
export class Popup {
    /** Resolves/measures/draws/drives every input this popup contains, Win98-themed, always focused while open. */
    private readonly display = new InteractableDisplay(INTERACTABLE_DEFAULTS, WIN98_THEME, "always");
    private title = "";
    private lines: DisplayLine[] = [];
    private buttons: ButtonInput[] = [];
    private readonly closeKeys: ReadonlySet<string>;
    private readonly onOpenChange: ((open: boolean) => void) | undefined;
    /** Total bounds this popup (panel plus any open select dropdown, which can extend past the panel) occupied last frame - see {@link draw}'s `repaintBackground`. */
    private lastOccupiedRect: BoundingRect | null = null;

    /**
     * @param options - Configures this popup. See {@link PopupOptions}.
     */
    public constructor(options: PopupOptions = {}) {
        this.closeKeys = new Set(options.closeKeys ?? ["Escape"]);
        this.onOpenChange = options.onOpenChange;
        this.display.setKeyDownInterceptor((event) => {
            if (this.closeKeys.has(event.key)) {
                this.close();
                return true;
            }
            return false;
        });
    }

    /**
     * Whether this popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    public isOpen(): boolean {
        return this.display.isActive();
    }

    /**
     * Opens this popup, resetting its cursor to the first focusable element.
     */
    public show(): void {
        this.display.setActive(true);
        this.onOpenChange?.(true);
    }

    /**
     * Closes this popup, committing any in-progress number-input edit first
     * so a typed value isn't lost.
     */
    public close(): void {
        this.display.setActive(false);
        this.lastOccupiedRect = null;
        this.onOpenChange?.(false);
    }

    /**
     * Sets the content this popup displays. Safe to call every frame while
     * open.
     *
     * @param title - Title shown above the popup's lines of text.
     * @param lines - Lines of styled segments (and/or inputs) shown below the title.
     * @param buttons - Buttons shown in a row at the bottom, navigated by the cursor.
     */
    public setContent(title: string, lines: DisplayLine[], buttons: ButtonInput[]): void {
        this.title = title;
        this.lines = lines;
        this.buttons = buttons;
    }

    /**
     * Paints the dimming layer behind this popup, across the whole canvas.
     * A no-op if closed. This need only be done once (when the popup is opened.(
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public drawOverlay(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        if (!this.isOpen()) {
            return;
        }

        ctx.fillStyle = POPUP_CONFIG.dimColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    /** Lays out the footer button row left to right from `x`, `POPUP_CONFIG.buttonGap` apart. */
    private layoutFooterButtons(buttons: ResolvedButtonElement[], x: number, y: number, height: number): FocusableElement[] {
        const focusables: FocusableElement[] = [];
        let buttonX = x;
        for (const button of buttons) {
            focusables.push(...this.display.layoutButton(button, buttonX, y, height));
            buttonX += button.width + POPUP_CONFIG.buttonGap;
        }
        return focusables;
    }

    /** Draws the footer button row left to right from `x`, `POPUP_CONFIG.buttonGap` apart. */
    private drawFooterButtons(ctx: CanvasRenderingContext2D, buttons: ResolvedButtonElement[], x: number, y: number, height: number): void {
        let buttonX = x;
        for (const button of buttons) {
            this.display.drawButton(ctx, button, buttonX, y, height);
            buttonX += button.width + POPUP_CONFIG.buttonGap;
        }
    }

    /** Offset (from the panel's content top) of the footer button row, and the content stack's total height - the row sits right below the lines, gapped from them only when there's at least one button. */
    private stackButtonRow(titleHeight: number, linesHeight: number, buttonHeight: number): {buttonRowOffset: number; contentHeight: number} {
        const hasButtons = this.buttons.length > 0;
        const buttonRowOffset = titleHeight + linesHeight + (hasButtons ? POPUP_CONFIG.buttonRowGap : 0);
        return {buttonRowOffset, contentHeight: hasButtons ? buttonRowOffset + buttonHeight : buttonRowOffset};
    }

    /** Repaints whatever sits behind this popup when `occupiedRect` shrank since last frame, so stale pixels in the now-uncovered area aren't left behind - then redraws the dim overlay `repaintBackground` would have wiped. Always remembers `occupiedRect` for the next frame's comparison. */
    private repaintIfShrunk(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, occupiedRect: BoundingRect, repaintBackground: (() => void) | undefined): void {
        if (repaintBackground && this.lastOccupiedRect !== null && !rectContains(occupiedRect, this.lastOccupiedRect)) {
            repaintBackground();
            this.drawOverlay(ctx, canvasWidth, canvasHeight);
        }
        this.lastOccupiedRect = occupiedRect;
    }

    /**
     * Draws this popup's panel, centred on the canvas.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     * @param repaintBackground - Called before painting if this popup's
     * occupied bounds (panel plus any open dropdown) shrank since last frame,
     * so whatever sits behind it can be re-blitted before stale pixels in the
     * now-uncovered area are left behind.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, repaintBackground?: () => void): void {
        if (!this.isOpen()) {
            return;
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        ctx.font = POPUP_CONFIG.titleFont;
        const titleWidth = this.title ? ctx.measureText(this.title).width : 0;

        // Resets the focus-index counter resolve* methods use to detect
        // "was I focused/editing/open last frame" - must run once per frame,
        // before the first resolve call, and lines/buttons must resolve in
        // the same order layoutFocusables/layoutButton visit them below.
        this.display.beginResolvePass();
        const {rows: lineRows, width: linesWidth, height: linesHeight} = this.display.resolveLines(ctx, this.lines, POPUP_CONFIG.lineSpacing);

        // Footer buttons
        const resolvedButtons = this.buttons.map((button) => this.display.resolveButton(ctx, button).element);
        const buttonRowWidth = resolvedButtons.reduce((sum, button) => sum + button.width, 0)
            + POPUP_CONFIG.buttonGap * Math.max(this.buttons.length - 1, 0);

        const contentWidth = Math.max(titleWidth, buttonRowWidth, linesWidth);
        const width = contentWidth + POPUP_CONFIG.padding * 2;

        const titleHeight = this.title ? POPUP_CONFIG.titleHeight : 0;
        const buttonHeight = Math.max(POPUP_CONFIG.lineSpacing, ...resolvedButtons.map((button) => button.height));
        const {buttonRowOffset, contentHeight} = this.stackButtonRow(titleHeight, linesHeight, buttonHeight);
        const height = contentHeight + POPUP_CONFIG.padding * 2;

        const x = (canvasWidth - width) / 2;
        const y = (canvasHeight - height) / 2;

        // Layout pass: resolve every focusable element's on-screen rect
        // before painting anything, so a click can be hit-tested against
        // the same rects the paint pass uses.
        const linesStartY = y + POPUP_CONFIG.padding + titleHeight;
        const inputFocusables = this.display.layoutLineFocusables(lineRows, x + POPUP_CONFIG.padding, linesStartY, POPUP_CONFIG.lineSpacing);

        const buttonRowY = y + POPUP_CONFIG.padding + buttonRowOffset;
        const buttonFocusables = this.layoutFooterButtons(resolvedButtons, x + POPUP_CONFIG.padding, buttonRowY, buttonHeight);

        this.display.setFocusables(this.display.mergeFocusables(inputFocusables, buttonFocusables));

        const panelRect: BoundingRect = {x, y, w: width, h: height};
        const displayBounds = this.display.getOccupiedBounds();
        const occupiedRect = displayBounds ? unionRect(panelRect, displayBounds) : panelRect;
        this.repaintIfShrunk(ctx, canvasWidth, canvasHeight, occupiedRect, repaintBackground);

        // Paint pass.
        ctx.fillStyle = WIN98_THEME.surfaceBackground;
        ctx.fillRect(x, y, width, height);
        const borderWidth = WIN98_THEME.borderWidth;
        WIN98_THEME.drawPanelBorder(ctx, x - borderWidth, y - borderWidth, width + borderWidth * 2, height + borderWidth * 2);

        if (this.title) {
            ctx.fillStyle = POPUP_CONFIG.titleColor;
            ctx.font = POPUP_CONFIG.titleFont;
            ctx.fillText(this.title, x + POPUP_CONFIG.padding, y + POPUP_CONFIG.padding);
        }

        this.display.drawLines(ctx, lineRows, x + POPUP_CONFIG.padding, linesStartY, POPUP_CONFIG.lineSpacing);
        this.drawFooterButtons(ctx, resolvedButtons, x + POPUP_CONFIG.padding, buttonRowY, buttonHeight);

        this.display.drawOverlays(ctx);
    }
}
