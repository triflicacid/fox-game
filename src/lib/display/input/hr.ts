import {ElementBase} from "./base";

/** Which neighbouring row(s) an {@link HrInput}'s bar matches - see {@link HrInput.length}. */
export type HrLength = "top" | "bottom" | "max";

/**
 * A horizontal rule: a plain bar sized against its neighbouring row(s),
 * minus its own left/right {@link ElementBase.padding}. Never focusable, so
 * it extends {@link ElementBase} rather than {@link InputBase}.
 */
export interface HrInput extends ElementBase {
    kind: "hr";
    /** Line thickness, in canvas pixels. Defaults to `1`. */
    thickness?: number;
    /** `"top"`/`"bottom"` matches the row above/below; `"max"` matches whichever is wider. A missing neighbour counts as `0`. Defaults to `"max"`. */
    length?: HrLength;
}
