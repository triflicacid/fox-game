import {TextSegment} from "../text-style";
import {RadioInput} from "./radio";
import {CheckboxInput} from "./checkbox";
import {NumberInput, TextInput} from "./text-box";
import {ButtonInput} from "./button";
import {SelectInput} from "./select";
import {HrInput} from "./hr";

export * from "./base";
export * from "./button";
export * from "./checkbox";
export * from "./hr";
export * from "./radio";
export * from "./select";
export * from "./text-box";

/**
 * Every kind of input an {@link InteractableDisplay} can embed alongside
 * plain text - interactive controls, plus the non-interactive {@link
 * HrInput} divider. Each kind carries its own `kind` literal.
 */
export type Input = RadioInput | CheckboxInput | NumberInput | TextInput | ButtonInput | SelectInput | HrInput;

/** A single item within a {@link DisplayLine}: styled text, or an {@link Input}. */
export type DisplayLineItem = TextSegment | Input;

/**
 * Builder-friendly wrapper form of a display line.
 *
 * `items` are rendered and laid out left-to-right in array order, identical to
 * the bare-array {@link DisplayLineItem[]} form.
 */
export interface Line {
    items: DisplayLineItem[];
}

/** A single line an {@link InteractableDisplay} can lay out, made of one or more top-level items. */
export type DisplayLine = DisplayLineItem[] | Line;
