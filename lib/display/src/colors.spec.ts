import {describe, expect, it} from "vitest";
import {COLORS} from "./colors";

describe("COLORS", () => {
    it("contains expected palette entries", () => {
        expect(Object.keys(COLORS).length).toBeGreaterThan(10);
        expect(COLORS.black).toBe("#000000");
        expect(COLORS.brightWhite).toBe("#ffffff");
    });

    it("uses hex colour string values", () => {
        const hexColour = /^#[0-9a-f]{6}$/i;
        for (const value of Object.values(COLORS)) {
            expect(hexColour.test(value)).toBe(true);
        }
    });
});

