import {ElementBase} from "./base";

/**
 * Strategy for choosing an {@link HrInput}'s target width: the row above
 * (`"top"`), the row below (`"bottom"`), whichever of the two is wider
 * (`"both"`), or the widest row anywhere in the whole resolved block
 * (`"max"`).
 */
export type HrLength = "top" | "bottom" | "both" | "max";

/**
 * A horizontal rule: a plain bar sized against its neighbouring row(s) or
 * the whole block, minus its own left/right {@link ElementBase.padding}.
 * Never focusable, so it extends {@link ElementBase} rather than
 * {@link InputBase}.
 */
export interface HrInput extends ElementBase {
    kind: "hr";
    /** Line thickness, in canvas pixels. Defaults to `1`. */
    thickness?: number;
    /** `"top"`/`"bottom"` matches the row above/below; `"both"` matches whichever of the two is wider; `"max"` matches the widest row anywhere in the block. A missing neighbour counts as `0`. Defaults to `"max"`. */
    length?: HrLength;
}
