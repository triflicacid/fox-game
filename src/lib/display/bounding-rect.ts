/** An axis-aligned rectangular region an element occupies on screen, in canvas pixels. */
export interface BoundingRect {
    /** Left edge, in pixels. */
    x: number;
    /** Top edge, in pixels. */
    y: number;
    /** Width, in pixels. */
    w: number;
    /** Height, in pixels. */
    h: number;
}

/**
 * Whether `(x, y)` falls within `rect`.
 *
 * @param x - Point's X coordinate.
 * @param y - Point's Y coordinate.
 * @param rect - Rect to test against.
 * @returns `true` if the point is inside `rect`.
 */
export function pointInRect(x: number, y: number, rect: BoundingRect): boolean {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Whether two {@link BoundingRect}s cover exactly the same area. */
export function rectsEqual(a: BoundingRect, b: BoundingRect): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
