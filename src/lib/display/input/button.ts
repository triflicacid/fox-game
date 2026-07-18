import {InputBase} from "./base";

/**
 * A button input, clickable via Enter/Space.
 */
export interface ButtonInput extends InputBase {
    kind: "button";
    /** Text shown for the button, wrapped in `[...]` when drawn. */
    label: string;
    /** Invoked when the button is activated. */
    onClick: () => void;
}
