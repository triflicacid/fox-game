import {TextStyle} from "../text-style";
import {StyleBuilder} from "./style";
import {ButtonInput, CheckboxInput, DisplayLineItem, HrInput, Line, NumberInput, RadioInput, SelectInput, TextInput} from "../input";

/** Field names, across every input kind, whose value is a {@link TextStyle}. */
type StyleFieldName = "style" | "focusedStyle" | "selectedStyle" | "editingStyle" | "expandedStyle" | "inputStyle" | "inputSelectedStyle";

/** `T` with every {@link TextStyle}-typed field widened to also accept a {@link StyleBuilder}. */
type WidenStyles<T> = {
    [K in keyof T]: K extends StyleFieldName ? (T[K] extends TextStyle | undefined ? TextStyle | StyleBuilder | undefined : T[K]) : T[K];
};

/** The props a factory function below accepts for input kind `T`: its own fields minus `kind`, styles widened. */
export type BuildProps<T extends {kind: string}> = Omit<WidenStyles<T>, "kind">;

/** Resolves any {@link StyleBuilder} field on `props` to a plain value of type `R`. Shared by every factory below. */
function normaliseStyles<R>(props: WidenStyles<R>): R {
    const result: Record<string, unknown> = {...props};
    for (const key of Object.keys(result)) {
        const value = result[key];
        if (value instanceof StyleBuilder) {
            result[key] = value.build();
        }
    }
    return result as R;
}

/** Builds a {@link ButtonInput}. */
export function button(props: BuildProps<ButtonInput>): ButtonInput {
    return {kind: "button", ...normaliseStyles<Omit<ButtonInput, "kind">>(props)};
}

/** Builds a {@link CheckboxInput}. */
export function checkbox(props: BuildProps<CheckboxInput>): CheckboxInput {
    return {kind: "checkbox", ...normaliseStyles<Omit<CheckboxInput, "kind">>(props)};
}

/** Builds a {@link RadioInput}. */
export function radio(props: BuildProps<RadioInput>): RadioInput {
    return {kind: "radio", ...normaliseStyles<Omit<RadioInput, "kind">>(props)};
}

/** Builds a {@link SelectInput}. */
export function select(props: BuildProps<SelectInput>): SelectInput {
    return {kind: "select", ...normaliseStyles<Omit<SelectInput, "kind">>(props)};
}

/** Builds a {@link TextInput}. Named `textbox` to match its `kind` literal. */
export function textbox(props: BuildProps<TextInput>): TextInput {
    return {kind: "textbox", ...normaliseStyles<Omit<TextInput, "kind">>(props)};
}

/** Builds a {@link NumberInput}. Named `numberBox` (not `number`) to avoid shadowing the global and to match its `kind: "number"` intent. */
export function numberBox(props: BuildProps<NumberInput>): NumberInput {
    return {kind: "number", ...normaliseStyles<Omit<NumberInput, "kind">>(props)};
}

/** Builds an {@link HrInput}. Every field is optional, so `props` is too. */
export function hr(props: BuildProps<HrInput> = {}): HrInput {
    return {kind: "hr", ...normaliseStyles<Omit<HrInput, "kind">>(props)};
}

/** A {@link Line} built via chained `.content(...)` calls. */
export class LineBuilder implements Line {
    public readonly items: DisplayLineItem[] = [];

    public content(item: DisplayLineItem | string): this {
        this.items.push(typeof item === "string" ? {content: item} : item);
        return this;
    }
}

/** Starts a {@link LineBuilder} chain for composing a {@link DisplayLine}. */
export function line(): LineBuilder {
    return new LineBuilder();
}
