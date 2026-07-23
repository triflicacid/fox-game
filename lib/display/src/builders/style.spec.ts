import {describe, expect, it} from "vitest";
import {content, style} from "./style";
import {TextFormat} from "../text-style";

describe("builders/style", () => {
    it("builds style fields by chaining", () => {
        const built = style().foreground("#fff").background("#000").fontFamily("mono").fontSize(14).invert().build();
        expect(built).toEqual({foreground: "#fff", background: "#000", fontFamily: "mono", fontSize: 14, invert: true});
    });

    it("sets and clears format flags", () => {
        const built = style().bold().italic().underline().italic(false).build();
        expect(built.format).toBe(TextFormat.BOLD | TextFormat.UNDERLINE);
    });

    it("sets and clears invert-format flags", () => {
        const built = style().unbold().unitalic().ununderline(false).build();
        expect(built.invertFormat).toBe(TextFormat.BOLD | TextFormat.ITALIC);
    });

    it("wraps plain text with content helper", () => {
        expect(content("text")).toEqual({content: "text"});
    });
});

