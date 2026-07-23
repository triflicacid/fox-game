import {TextStyle} from "./text-style";

/** A {@link TextStyle} reduced to the fields a post-layout overlay can apply: an `undefined` field leaves whatever is underneath. */
export interface ResolvedStateStyle {
    foreground: string | undefined;
    background: string | undefined;
}

/** Resolves `style`'s colours over `base`. Font, size, and format are ignored so an overlay never changes measured width. `invert` swaps the resolved pair - a no-op when `background` ends up unset. */
export function resolveStateStyle(style: TextStyle | undefined, base: ResolvedStateStyle): ResolvedStateStyle {
    const resolved = {
        foreground: style?.foreground ?? base.foreground,
        background: style?.background ?? base.background,
    };
    return style?.invert && resolved.background !== undefined
        ? {foreground: resolved.background, background: resolved.foreground}
        : resolved;
}
