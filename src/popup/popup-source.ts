import {KeyBinding} from "../help/key-binding";

/**
 * Something that owns a {@link Popup} and can be toggled independently of
 * every other popup source. {@link WorldController} keeps a list of these
 * and draws whichever one is currently open.
 */
export interface PopupSource {
    /**
     * Whether this source's popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    isOpen(): boolean;

    /**
     * This source's own key bindings, for the help popup to list.
     *
     * @returns This source's key bindings.
     */
    getKeyBindings(): KeyBinding[];

    /**
     * Draws this source's popup. A no-op if it isn't open.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void;
}
