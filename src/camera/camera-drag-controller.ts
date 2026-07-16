import {Camera} from "./camera";
import {Vector2d} from "../geometry/vector2d";

/**
 * Lets the user pan a {@link Camera} by clicking and dragging on a canvas
 * with the mouse. The drag is tracked on `window` (not just the canvas) so
 * panning doesn't get stuck if the cursor leaves the canvas mid-drag.
 */
export class CameraDragController {
    private dragOrigin: Vector2d | null = null;

    /**
     * @param canvas - Canvas element to listen for drag input on.
     * @param camera - Camera to pan as the user drags.
     */
    public constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Camera) {
        this.canvas.addEventListener("mousedown", this.handleMouseDown);
        this.canvas.addEventListener("mousemove", this.handleMouseMove);
        this.canvas.addEventListener("mouseup", this.handleMouseUp);
    }

    private readonly handleMouseDown = (event: MouseEvent): void => {
        this.dragOrigin = new Vector2d(event.clientX, event.clientY);
    };

    private readonly handleMouseMove = (event: MouseEvent): void => {
        if (!this.dragOrigin) {
            return;
        }
        const position = new Vector2d(event.clientX, event.clientY);
        this.camera.pan(this.dragOrigin.subtract(position));
        this.dragOrigin = position;
    };

    private readonly handleMouseUp = (): void => {
        this.dragOrigin = null;
    };
}
