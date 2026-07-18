import {TextSegment} from "../text-style";
import {InputBase} from "./base";

/**
 * A single checkbox. Toggling it invokes `onToggle` with its new checked state.
 */
export interface CheckboxInput extends InputBase {
    kind: "checkbox";
    /** Whether the checkbox is currently checked. */
    checked: boolean;
    /** Content shown as this checkbox's label. */
    content: TextSegment[];
    /** Invoked with the new checked state when the user toggles it. */
    onToggle: (checked: boolean) => void;
}
