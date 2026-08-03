import {Vector2d} from "../geometry/vector2d";
import {Rect} from "../geometry/rect";

/**
 * A rectangular view onto the world: a centre point plus a viewport size.
 * {@link World.draw} and {@link World.update} use a camera to work out
 * which part of the world is visible.
 */
export class Camera {
    /** Lower bound for {@link setZoom}/{@link zoomBy} - furthest the camera can zoom out. */
    private static readonly MIN_ZOOM = 0.1;

    /** Upper bound for {@link setZoom}/{@link zoomBy} - furthest the camera can zoom in. */
    private static readonly MAX_ZOOM = 10;

    private zoom = 1;

    /**
     * @param center - World-space point the camera is centred on.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     */
    public constructor(private center: Vector2d, private canvasWidth: number, private canvasHeight: number) {
    }

    /**
     * This camera's centre point.
     *
     * @returns The centre point, in world pixels.
     */
    public getCenter(): Vector2d {
        return this.center;
    }

    /**
     * Moves this camera's centre to the given world-space point.
     *
     * @param center - New centre point, in world pixels.
     */
    public setCenter(center: Vector2d): void {
        this.center = center;
    }

    /**
     * Moves this camera's centre to a new X position, keeping Y unchanged.
     *
     * @param x - New centre X position, in world pixels.
     */
    public setX(x: number): void {
        this.center = new Vector2d(x, this.center.y);
    }

    /**
     * Moves this camera's centre to a new Y position, keeping X unchanged.
     *
     * @param y - New centre Y position, in world pixels.
     */
    public setY(y: number): void {
        this.center = new Vector2d(this.center.x, y);
    }

    /**
     * Moves this camera's centre by the given offset.
     *
     * @param delta - Offset to move by, in world pixels.
     */
    public pan(delta: Vector2d): void {
        this.center = this.center.add(delta);
    }

    /**
     * Viewport width, adjusted for the current zoom level.
     *
     * @returns The width, in world pixels.
     */
    public getWidth(): number {
        return this.canvasWidth / this.zoom;
    }

    /**
     * Viewport height, adjusted for the current zoom level.
     *
     * @returns The height, in world pixels.
     */
    public getHeight(): number {
        return this.canvasHeight / this.zoom;
    }

    /**
     * Resizes this camera's viewport, e.g. to follow a canvas resize.
     *
     * @param width - New canvas width, in canvas pixels.
     * @param height - New canvas height, in canvas pixels.
     */
    public setViewportSize(width: number, height: number): void {
        this.canvasWidth = width;
        this.canvasHeight = height;
    }

    /**
     * This camera's current zoom level, where `1` shows the world at native
     * pixel scale, greater than `1` zooms in, and less than `1` zooms out.
     *
     * @returns The current zoom level.
     */
    public getZoom(): number {
        return this.zoom;
    }

    /**
     * Sets this camera's zoom level directly, clamped to
     * [{@link MIN_ZOOM}, {@link MAX_ZOOM}].
     *
     * @param zoom - The zoom level to set.
     */
    public setZoom(zoom: number): void {
        this.zoom = Math.min(Camera.MAX_ZOOM, Math.max(Camera.MIN_ZOOM, zoom));
    }

    /**
     * Multiplies this camera's zoom level by `factor`, clamped to
     * [{@link MIN_ZOOM}, {@link MAX_ZOOM}]. Since the view is always centred
     * on {@link center}, this zooms in/out around the camera's own position.
     *
     * @param factor - Multiplier to apply to the current zoom level, e.g.
     * `1.05` to zoom in 5% or `1 / 1.05` to zoom out 5%.
     */
    public zoomBy(factor: number): void {
        this.setZoom(this.zoom * factor);
    }

    /**
     * Left edge of the visible view.
     *
     * @returns The left edge's X position, in world pixels.
     */
    public getViewX(): number {
        return this.center.x - this.getWidth() / 2;
    }

    /**
     * Top edge of the visible view.
     *
     * @returns The top edge's Y position, in world pixels.
     */
    public getViewY(): number {
        return this.center.y - this.getHeight() / 2;
    }

    /**
     * Whether a rectangle in world space is at least partially visible
     * within this camera's view.
     *
     * @param rect - Rectangle to test, in world pixels.
     * @returns `true` if any part of the rectangle overlaps the view.
     */
    public isRectVisible(rect: Rect): boolean {
        return rect.x + rect.w > this.getViewX() && rect.x < this.getViewX() + this.getWidth()
            && rect.y + rect.h > this.getViewY() && rect.y < this.getViewY() + this.getHeight();
    }
}
