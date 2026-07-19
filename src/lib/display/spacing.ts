/**
 * Padding/margin shorthand, CSS-style: a single number for all four sides,
 * `[vertical, horizontal]`, or `[top, right, bottom, left]`.
 */
export type Spacing = number | [number, number] | [number, number, number, number];

/** A {@link Spacing} value normalized to explicit `[top, right, bottom, left]`, in canvas pixels. */
export type ResolvedSpacing = [top: number, right: number, bottom: number, left: number];

/** `Spacing` with every side `0` - the default when a `Spacing` field is left unset. */
export const ZERO_SPACING: ResolvedSpacing = [0, 0, 0, 0];

/**
 * Normalizes `spacing` to a {@link ResolvedSpacing}, so callers don't
 * repeat the number/2-tuple/4-tuple expansion themselves.
 *
 * @param spacing - The shorthand value to resolve, or `undefined` for {@link ZERO_SPACING}.
 * @returns `[top, right, bottom, left]`.
 */
export function resolveSpacing(spacing: Spacing | undefined): ResolvedSpacing {
    if (spacing === undefined) {
        return ZERO_SPACING;
    }
    if (typeof spacing === "number") {
        return [spacing, spacing, spacing, spacing];
    }
    if (spacing.length === 2) {
        const [vertical, horizontal] = spacing;
        return [vertical, horizontal, vertical, horizontal];
    }
    return spacing;
}
