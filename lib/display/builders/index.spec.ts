import {describe, expect, it} from "vitest";
import {content, spacing, style} from "./index";

describe("builders/index re-exports", () => {
    it("re-exports style builder entrypoints", () => {
        expect(typeof style).toBe("function");
        expect(content("x")).toEqual({content: "x"});
    });

    it("re-exports spacing helper", () => {
        expect(spacing(2, 3)).toEqual([2, 3]);
    });
});

