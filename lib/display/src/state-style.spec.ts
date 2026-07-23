import {describe, expect, it} from "vitest";
import {resolveStateStyle} from "./state-style";

describe("resolveStateStyle", () => {
    it("falls back to base values", () => {
        const base = {foreground: "#111", background: "#222"};
        expect(resolveStateStyle(undefined, base)).toEqual(base);
    });

    it("applies field overrides", () => {
        const base = {foreground: "#111", background: "#222"};
        expect(resolveStateStyle({foreground: "#aaa"}, base)).toEqual({foreground: "#aaa", background: "#222"});
    });

    it("inverts only when background resolves", () => {
        expect(resolveStateStyle({invert: true}, {foreground: "#111", background: undefined})).toEqual({foreground: "#111", background: undefined});
        expect(resolveStateStyle({foreground: "#aaa", invert: true}, {foreground: "#111", background: "#222"})).toEqual({foreground: "#222", background: "#aaa"});
    });
});

