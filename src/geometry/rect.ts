/** An axis-aligned rectangular region, in pixels. */
export interface Rect {
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
export function pointInRect(x: number, y: number, rect: Rect): boolean {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
