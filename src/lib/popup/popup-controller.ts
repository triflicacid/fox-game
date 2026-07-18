import {Popup, PopupOptions} from "./popup";
import {DisplayLine} from "../display/input";
import {KeyBinding} from "../../help/key-binding";

/**
 * Base for anything that owns a {@link Popup}, toggled independently of
 * every other popup controller.
 */
export abstract class PopupController {
    protected readonly popup: Popup;

    /**
     * @param title - Title shown atop the popup.
     * @param toggleKey - Key that opens the popup.
     * @param popupOptions - Forwarded to the underlying {@link Popup}.
     */
    protected constructor(
        private readonly title: string,
        private readonly toggleKey: string,
        popupOptions: PopupOptions,
    ) {
        this.popup = new Popup(popupOptions);
        window.addEventListener("keydown", this.handleKeyDown);
    }

    /**
     * Whether this controller's popup is currently shown.
     *
     * @returns `true` if the popup is open.
     */
    public isOpen(): boolean {
        return this.popup.isOpen();
    }

    /**
     * This controller's own key bindings, for the help popup to list.
     *
     * @returns This controller's key bindings.
     */
    public abstract getKeyBindings(): KeyBinding[];

    /**
     * Paints the dimming layer behind this controller's popup. A no-op if it
     * isn't open. Only needs calling once per open.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public drawOverlay(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
        this.popup.drawOverlay(ctx, canvasWidth, canvasHeight);
    }

    /**
     * Draws this controller's popup panel, refreshing its content from
     * {@link buildContent} first. A no-op if it isn't open.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     * @param repaintBackground - Forwarded to {@link Popup.draw}.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, repaintBackground?: () => void): void {
        this.popup.setContent(this.title, this.buildContent(), [
            {kind: "button", label: "Close", onClick: () => this.popup.close()},
        ]);
        this.popup.draw(ctx, canvasWidth, canvasHeight, repaintBackground);
    }

    /**
     * Builds this popup's content lines, called fresh on every {@link draw}.
     *
     * @returns The lines to show in the popup.
     */
    protected abstract buildContent(): DisplayLine[];

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === this.toggleKey) {
            this.popup.show();
        }
    };
}
