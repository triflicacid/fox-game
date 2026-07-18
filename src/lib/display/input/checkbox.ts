import {TextSegment, TextStyle} from "../text-style";
import {InputBase} from "./base";

/**
 * A single checkbox. Toggling it invokes `onToggle` with its new checked state.
 *
 * Colour precedence, resolved per field (foreground/background
 * independently): label and its background rect - `focusedStyle` while
 * focused > `selectedStyle` while checked > default. The box/tick is
 * unaffected by focus: `inputSelectedStyle` (falls back to `selectedStyle`,
 * then the theme's default box look) while checked > `inputStyle` (falls
 * back to `style`, then the theme's default box look) at rest. That default
 * is always concrete, so `invert` on either always has a colour pair to swap
 * even with nothing else set.
 */
export interface CheckboxInput extends InputBase {
    kind: "checkbox";
    /** Whether the checkbox is currently checked. */
    checked: boolean;
    /** Content shown as this checkbox's label. */
    content: TextSegment[];
    /** Style colouring just the box while checked. Falls back to `selectedStyle`, then the theme's default box look. */
    inputSelectedStyle?: TextStyle;
    /** Style colouring just the box at rest (unchecked, unfocused). Falls back to `style`, then the theme's default box look. */
    inputStyle?: TextStyle;
    /** Invoked with the new checked state when the user toggles it. */
    onToggle: (checked: boolean) => void;
}
