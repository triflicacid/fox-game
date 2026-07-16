import {Vector2d} from "../geometry/vector2d";

/**
 * A rectangular view onto the world: a centre point plus a viewport size.
 * {@link World.draw} and {@link World.update} use a camera to work out
 * which part of the world is visible.
 */
export class Camera {
    /**
     * @param center - World-space point the camera is centred on.
     * @param width - Viewport width, in canvas pixels.
     * @param height - Viewport height, in canvas pixels.
     */
    public constructor(private center: Vector2d, private width: number, private height: number) {
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
     * Moves this camera's centre by the given offset.
     *
     * @param delta - Offset to move by, in world pixels.
     */
    public pan(delta: Vector2d): void {
        this.center = this.center.add(delta);
    }

    /**
     * Viewport width.
     *
     * @returns The width, in canvas pixels.
     */
    public getWidth(): number {
        return this.width;
    }

    /**
     * Viewport height.
     *
     * @returns The height, in canvas pixels.
     */
    public getHeight(): number {
        return this.height;
    }

    /**
     * Resizes this camera's viewport, e.g. to follow a canvas resize.
     *
     * @param width - New viewport width, in canvas pixels.
     * @param height - New viewport height, in canvas pixels.
     */
    public setViewportSize(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    /**
     * Left edge of the visible view.
     *
     * @returns The left edge's X position, in world pixels.
     */
    public getViewX(): number {
        return this.center.x - this.width / 2;
    }

    /**
     * Top edge of the visible view.
     *
     * @returns The top edge's Y position, in world pixels.
     */
    public getViewY(): number {
        return this.center.y - this.height / 2;
    }

    /**
     * Whether a rectangle in world space is at least partially visible
     * within this camera's view.
     *
     * @param x - Left edge of the rectangle, in world pixels.
     * @param y - Top edge of the rectangle, in world pixels.
     * @param width - Width of the rectangle, in world pixels.
     * @param height - Height of the rectangle, in world pixels.
     * @returns `true` if any part of the rectangle overlaps the view.
     */
    public isRectVisible(x: number, y: number, width: number, height: number): boolean {
        return x + width > this.getViewX() && x < this.getViewX() + this.width
            && y + height > this.getViewY() && y < this.getViewY() + this.height;
    }
}
