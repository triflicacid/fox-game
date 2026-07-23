import {describe, expect, it} from "vitest";
import {ChromeTheme} from "./chrome-theme";
import {createMockCanvasContext} from "./test-helpers/mock-canvas";

class TestTheme extends ChromeTheme {
    public constructor() {
        super("#111", "#222", "#333", 2);
    }

    public defaultFocusedStyle() {
        return {foreground: "#fff", background: "#000"};
    }

    public drawPanelBorder(_ctx: CanvasRenderingContext2D, _x: number, _y: number, _w: number, _h: number): void {}
    public drawBox(_ctx: CanvasRenderingContext2D, _x: number, _y: number, _w: number, _h: number, _kind: "sunken" | "raised"): void {}
    public boxDimensionsFor(contentWidth: number, contentHeight: number): {w: number; h: number} { return {w: contentWidth, h: contentHeight}; }
    public drawRadioMarker(_ctx: CanvasRenderingContext2D, _cx: number, _cy: number, _radius: number, _selected: boolean): void {}
    public drawSelectArrowButton(_ctx: CanvasRenderingContext2D, _x: number, _y: number, _w: number, _h: number, _open: boolean): void {}
    public drawButtonBox(_ctx: CanvasRenderingContext2D, _x: number, _y: number, _w: number, _h: number, _pressed: boolean): void {}
    public drawLine(_ctx: CanvasRenderingContext2D, _x1: number, _y1: number, _x2: number, _y2: number, _thickness: number): void {}
}

describe("ChromeTheme.drawButtonFocus", () => {
    it("does nothing when background is undefined", () => {
        const {ctx, ops} = createMockCanvasContext();
        new TestTheme().drawButtonFocus(ctx, 10, 20, 50, 30, {foreground: "#fff", background: undefined});
        expect(ops).toEqual([]);
    });

    it("fills inset area using borderWidth", () => {
        const {ctx, ops} = createMockCanvasContext();
        new TestTheme().drawButtonFocus(ctx, 10, 20, 50, 30, {foreground: "#fff", background: "#0f0"});
        expect(ops).toContainEqual({kind: "fillRect", args: [12, 22, 46, 26]});
    });
});



