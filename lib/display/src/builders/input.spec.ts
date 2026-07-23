import {describe, expect, it, vi} from "vitest";
import {button, checkbox, hr, line, numberBox, radio, select, textbox} from "./input";
import {style} from "./style";

describe("builders/input", () => {
    it("normalises StyleBuilder fields", () => {
        const built = button({
            content: "Run",
            focusedStyle: style().foreground("#fff").background("#00f"),
            onClick: vi.fn(),
        });
        expect(built.focusedStyle).toEqual({foreground: "#fff", background: "#00f"});
    });

    it("sets correct kind literals", () => {
        const onSelect = vi.fn();
        expect(checkbox({checked: true, onToggle: vi.fn()}).kind).toBe("checkbox");
        expect(radio({options: [{key: "a"}], selected: "a", onSelect}).kind).toBe("radio");
        expect(select({options: [{key: "a"}], selected: "a", onSelect}).kind).toBe("select");
        expect(textbox({value: "abc", onChange: vi.fn(() => true)}).kind).toBe("textbox");
        expect(numberBox({value: 5, onChange: vi.fn()}).kind).toBe("number");
        expect(hr().kind).toBe("hr");
    });

    it("builds lines in order with fluent chaining", () => {
        const row = line().content("Label").content(button({content: "OK", onClick: vi.fn()}));
        expect(row.items[0]).toEqual({content: "Label"});
        expect((row.items[1] as {kind: string}).kind).toBe("button");
    });
});

