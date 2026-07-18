import {TextSegment} from "../text-style";
import {RadioInput} from "./radio";
import {CheckboxInput} from "./checkbox";
import {NumberInput, TextInput} from "./text-box";
import {ButtonInput} from "./button";
import {SelectInput} from "./select";

export * from "./base";
export * from "./button";
export * from "./checkbox";
export * from "./radio";
export * from "./select";
export * from "./text-box";

/**
 * Every kind of interactive input an {@link InteractableDisplay} can embed
 * alongside plain text. Each kind carries its own `kind` literal.
 */
export type Input = RadioInput | CheckboxInput | NumberInput | TextInput | ButtonInput | SelectInput;

/** A single item within a {@link DisplayLine}: styled text, or an interactive input. */
export type DisplayLineItem = TextSegment | Input;

/** A single line an {@link InteractableDisplay} can lay out, made of one or more top-level items. */
export type DisplayLine = DisplayLineItem[];
