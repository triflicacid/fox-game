import {describe, expect, it} from "vitest";
import {TextFormat} from "./text-style";

describe("TextFormat", () => {
    it("uses unique bit flags", () => {
        const values = [TextFormat.BOLD, TextFormat.ITALIC, TextFormat.UNDERLINE, TextFormat.UPPERCASE, TextFormat.LOWERCASE];
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
        for (const value of values) {
            expect((value & (value - 1)) === 0).toBe(true);
        }
    });

    it("keeps NONE as zero", () => {
        expect(TextFormat.NONE).toBe(0);
    });
});

