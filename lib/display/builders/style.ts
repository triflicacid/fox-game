import {TextFormat, TextSegment, TextStyle} from "../text-style";

/** Accumulates a {@link TextStyle} via chained setters, e.g. `style().bold().italic()`. */
export class StyleBuilder {
    private readonly data: TextStyle = {};

    public foreground(colour: string): this {
        this.data.foreground = colour;
        return this;
    }

    public background(colour: string): this {
        this.data.background = colour;
        return this;
    }

    public fontFamily(family: string): this {
        this.data.fontFamily = family;
        return this;
    }

    public fontSize(size: number): this {
        this.data.fontSize = size;
        return this;
    }

    public bold(value = true): this {
        return this.setFormatFlag(TextFormat.BOLD, value);
    }

    public italic(value = true): this {
        return this.setFormatFlag(TextFormat.ITALIC, value);
    }

    public underline(value = true): this {
        return this.setFormatFlag(TextFormat.UNDERLINE, value);
    }

    public uppercase(value = true): this {
        return this.setFormatFlag(TextFormat.UPPERCASE, value);
    }

    public lowercase(value = true): this {
        return this.setFormatFlag(TextFormat.LOWERCASE, value);
    }

    public unbold(value = true): this {
        return this.setInvertFormatFlag(TextFormat.BOLD, value);
    }

    public unitalic(value = true): this {
        return this.setInvertFormatFlag(TextFormat.ITALIC, value);
    }

    public ununderline(value = true): this {
        return this.setInvertFormatFlag(TextFormat.UNDERLINE, value);
    }

    public unuppercase(value = true): this {
        return this.setInvertFormatFlag(TextFormat.UPPERCASE, value);
    }

    public unlowercase(value = true): this {
        return this.setInvertFormatFlag(TextFormat.LOWERCASE, value);
    }

    public invert(value = true): this {
        this.data.invert = value;
        return this;
    }

    public fontSizeDelta(delta: number | ((size: number) => number)): this {
        this.data.fontSizeDelta = delta;
        return this;
    }

    /** Returns the accumulated {@link TextStyle}. */
    public build(): TextStyle {
        return this.data;
    }

    private setFormatFlag(flag: number, value: boolean): this {
        const format = this.data.format ?? TextFormat.NONE;
        this.data.format = value ? format | flag : format & ~flag;
        return this;
    }

    private setInvertFormatFlag(flag: number, value: boolean): this {
        const invertFormat = this.data.invertFormat ?? TextFormat.NONE;
        this.data.invertFormat = value ? invertFormat | flag : invertFormat & ~flag;
        return this;
    }
}

/** Starts a {@link StyleBuilder} chain for composing a {@link TextStyle}. */
export function style(): StyleBuilder {
    return new StyleBuilder();
}

/** Wraps `text` as a plain {@link TextSegment}. */
export function content(text: string): TextSegment {
    return {content: text};
}
