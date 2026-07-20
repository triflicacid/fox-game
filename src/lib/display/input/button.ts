import {InputBase} from "./base";
import {TextSegment} from "../text-style";

/**
 * A button input: a bevelled box sized to its label, clickable via mouse or
 * Enter/Space, visibly depressed while pressed.
 *
 * Colour precedence: `focusedStyle` while focused, otherwise the theme's
 * default look.
 */
export interface ButtonInput extends InputBase {
    kind: "button";
    /** Content shown as this button's label. Unset for no label (e.g. an icon-only button). */
    content?: string | TextSegment[];
    /** Invoked when the button is activated. */
    onClick: () => void;
}
