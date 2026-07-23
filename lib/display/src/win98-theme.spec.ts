import {describe, expect, it} from "vitest";
import {WIN98_THEME} from "./win98-theme";
import {createMockCanvasContext} from "./test-helpers/mock-canvas";

describe("WIN98_THEME", () => {
    it("reports bevel chrome by expanding dimensions by 2", () => {
        expect(WIN98_THEME.boxDimensionsFor(10, 6)).toEqual({w: 12, h: 8});
    });

    it("drawLine renders horizontal groove as two fill bands", () => {
        const {ctx, ops} = createMockCanvasContext();
        WIN98_THEME.drawLine(ctx, 2, 10, 22, 10, 3);
        const fillRects = ops.filter((op) => op.kind === "fillRect");
        expect(fillRects.length).toBe(2);
    });

    it("drawLine falls back to stroked diagonal line", () => {
        const {ctx, ops} = createMockCanvasContext();
        WIN98_THEME.drawLine(ctx, 1, 2, 6, 7, 2);
        expect(ops.some((op) => op.kind === "lineTo")).toBe(true);
        expect(ops.some((op) => op.kind === "stroke")).toBe(true);
    });
});

