import {ButtonInput, DisplayLine} from "../display/input";
import {InteractableDisplay, InteractableDisplayDefaults, FocusableElement} from "../display/interactable-display";
import {WIN98_THEME} from "../display/win98-theme";
import {POPUP_CONFIG} from "./popup-config";
import {BoundingRect, rectContains, unionRect} from "../display/bounding-rect";

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
    lineHeight: POPUP_CONFIG.lineHeight,
    radioMarkerSize: POPUP_CONFIG.radioMarkerSize,
    radioMarkerGap: POPUP_CONFIG.radioMarkerGap,
    radioOptionGap: POPUP_CONFIG.radioOptionGap,
    checkboxSize: POPUP_CONFIG.checkboxSize,
    checkboxGap: POPUP_CONFIG.checkboxGap,
    numberInputWidth: POPUP_CONFIG.numberInputWidth,
    numberInputPadding: POPUP_CONFIG.numberInputPadding,
    cursorBlinkIntervalMs: POPUP_CONFIG.cursorBlinkIntervalMs,
    selectPadding: POPUP_CONFIG.selectPadding,
    selectArrowWidth: POPUP_CONFIG.selectArrowWidth,
    focusHighlightPadding: POPUP_CONFIG.focusHighlightPadding,
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
        const lineRows = this.lines.map((line) => this.display.resolveElements(ctx, line));

        // Footer buttons
        const resolvedButtons = this.buttons.map((button) => this.display.resolveButton(ctx, button).element);
        const buttonRowWidth = resolvedButtons.reduce((sum, button) => sum + button.width, 0)
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
        // before painting anything, so a click can be hit-tested against
        // the same rects the paint pass uses.
        const linesStartY = y + POPUP_CONFIG.padding + titleHeight;
        const inputFocusables: FocusableElement[] = [];
        let lineY = linesStartY;
        for (const row of lineRows) {
            inputFocusables.push(...this.display.layoutFocusables(row, x + POPUP_CONFIG.padding, lineY));
            lineY += row.height;
        }

        const buttonRowY = linesStartY + linesHeight + (this.buttons.length > 0 ? POPUP_CONFIG.buttonRowGap : 0);
        const buttonFocusables: FocusableElement[] = [];
        let buttonLayoutX = x + POPUP_CONFIG.padding;
        for (const button of resolvedButtons) {
            buttonFocusables.push(...this.display.layoutButton(button, buttonLayoutX, buttonRowY, POPUP_CONFIG.lineHeight));
            buttonLayoutX += button.width + POPUP_CONFIG.buttonGap;
        }

        const focusables = [...inputFocusables, ...buttonFocusables].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
        this.display.setFocusables(focusables);

        const panelRect: BoundingRect = {x, y, w: width, h: height};
        const displayBounds = this.display.getBounds();
        const occupiedRect = displayBounds ? unionRect(panelRect, displayBounds) : panelRect;
        if (repaintBackground && this.lastOccupiedRect !== null && !rectContains(occupiedRect, this.lastOccupiedRect)) {
            repaintBackground();
            this.drawOverlay(ctx, canvasWidth, canvasHeight);
        }
        this.lastOccupiedRect = occupiedRect;

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

        lineY = linesStartY;
        for (const row of lineRows) {
            this.display.drawElements(ctx, row, x + POPUP_CONFIG.padding, lineY);
            lineY += row.height;
        }

        let buttonX = x + POPUP_CONFIG.padding;
        for (const button of resolvedButtons) {
            this.display.drawButton(ctx, button, buttonX, buttonRowY, POPUP_CONFIG.lineHeight);
            buttonX += button.width + POPUP_CONFIG.buttonGap;
        }

        // Open select's dropdown paints last, on top of everything below it.
        this.display.drawOpenSelectDropdown(ctx);
    }
}
