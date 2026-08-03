import {Camera} from "./camera";
import {KeyBinding} from "../help/key-binding";

/**
 * Lets the user zoom a {@link Camera} in/out with Shift + scroll wheel.
 * Scrolling up zooms in, scrolling down zooms out, always centred on the
 * camera's own position since {@link Camera.zoomBy} keeps the view centred
 * on {@link Camera.getCenter}.
 */
export class CameraZoomController {
    /** Fraction the zoom level changes by per wheel event, e.g. `0.05` for +/-5%. */
    private static readonly ZOOM_STEP = 0.05;

    /**
     * @param canvas - Canvas element to listen for wheel input on.
     * @param camera - Camera to zoom as the user scrolls.
     */
    public constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Camera) {
        this.canvas.addEventListener("wheel", this.handleWheel, {passive: false});
    }

    private readonly handleWheel = (event: WheelEvent): void => {
        if (!event.shiftKey) {
            return;
        }
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1 + CameraZoomController.ZOOM_STEP : 1 - CameraZoomController.ZOOM_STEP;
        this.camera.zoomBy(factor);
    };

    /**
     * This controller's key bindings, for the help popup.
     *
     * @returns This controller's key bindings.
     */
    public getKeyBindings(): KeyBinding[] {
        return [{key: "Shift + Scroll", description: "Zoom camera in/out"}];
    }
}
