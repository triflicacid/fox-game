import {describe, expect, it} from "vitest";
import {FLAT_THEME} from "./flat-theme";
import {createMockCanvasContext} from "./test-helpers/mock-canvas";

describe("FLAT_THEME", () => {
    it("reports 1px chrome by expanding dimensions by 2", () => {
        expect(FLAT_THEME.boxDimensionsFor(10, 6)).toEqual({w: 12, h: 8});
    });

    it("drawButtonBox draws outer outline and extra inner outline when pressed", () => {
        const {ctx, ops} = createMockCanvasContext();
        FLAT_THEME.drawButtonBox(ctx, 10, 20, 40, 14, true);

        const strokeRects = ops.filter((op) => op.kind === "strokeRect");
        expect(strokeRects.length).toBe(2);
    });
});

