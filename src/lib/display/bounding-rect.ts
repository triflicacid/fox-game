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

/** Whether `outer` fully covers `inner` - every point `inner` occupies is also within `outer`. */
export function rectContains(outer: BoundingRect, inner: BoundingRect): boolean {
    return inner.x >= outer.x && inner.y >= outer.y
        && inner.x + inner.w <= outer.x + outer.w
        && inner.y + inner.h <= outer.y + outer.h;
}

/** The smallest {@link BoundingRect} that contains both `a` and `b`. */
export function unionRect(a: BoundingRect, b: BoundingRect): BoundingRect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x,
        y,
        w: Math.max(a.x + a.w, b.x + b.w) - x,
        h: Math.max(a.y + a.h, b.y + b.h) - y,
    };
}
