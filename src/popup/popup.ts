import {PopupLine} from "./text-style";
import {Rect, pointInRect} from "../geometry/rect";

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

/**
 * A generic modal popup: a title, some lines of text, and a row of buttons
 * navigated by a keyboard cursor. While open, it takes over the keyboard
 * entirely (see {@link handleKeyDown}), so no other key-driven controller
 * reacts to input until it's closed. Purely a data/interaction model - pair
 * it with {@link drawPopup} to actually render it.
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
     * This popup's title, as last set via {@link setContent}.
     *
     * @returns The current title.
     */
    public getTitle(): string {
        return this.title;
    }

    /**
     * This popup's lines, as last set via {@link setContent}.
     *
     * @returns The current lines.
     */
    public getLines(): readonly PopupLine[] {
        return this.lines;
    }

    /**
     * This popup's buttons, as last set via {@link setContent}.
     *
     * @returns The current buttons.
     */
    public getButtons(): readonly PopupButton[] {
        return this.buttons;
    }

    /**
     * Records each button's last-drawn on-screen bounds, so a mouse click
     * can be hit-tested against them. Called by {@link drawPopup} after it
     * lays the button row out; not meant to be called directly.
     *
     * @param bounds - One rect per button, in the same order as {@link getButtons}.
     */
    public setButtonBounds(bounds: Rect[]): void {
        this.buttonBounds = bounds;
    }

    /**
     * Index into {@link getButtons} of the button the keyboard cursor is
     * currently on, or `null` if the cursor has been moved off every button
     * (deselecting all of them).
     *
     * @returns The current cursor index, or `null` if nothing's selected.
     */
    public getCursor(): number | null {
        return this.cursor;
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
     * controller sees it (registered on the capture phase, then stopping
     * propagation): a configured close key shuts the popup; otherwise
     * `ArrowLeft`/`ArrowRight` move the cursor between buttons (and "nothing
     * selected" - see {@link moveCursor}), and `Enter`/`Space` activates
     * whichever button the cursor is currently on, if any.
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
     * While open, hit-tests a click against {@link buttonBounds}: a hit
     * moves the cursor to that button and activates it. Registered on the
     * capture phase and stops propagation while open, for the same reason
     * as {@link handleMouseDown}.
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
