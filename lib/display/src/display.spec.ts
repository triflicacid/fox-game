import {describe, expect, it} from "vitest";
import {Display} from "./display";
import {TextFormat, TextSegment} from "./text-style";
import {createMockCanvasContext} from "./test-helpers/mock-canvas";

describe("Display", () => {
    it("applies inherited styles and uppercase formatting", () => {
        const {ctx} = createMockCanvasContext();
        const display = new Display({fontFamily: "mono", fontSize: 12, foreground: "#111"});

        const segments: TextSegment[] = [{
            content: [{content: "fox", style: {format: TextFormat.UPPERCASE, foreground: "#0f0"}}],
            style: {background: "#000"},
        }];

        const line = display.resolveLine(ctx, segments);
        expect(line.runs[0].run.text).toBe("FOX");
        expect(line.runs[0].run.background).toBe("#000");
        expect(line.runs[0].run.foreground).toBe("#0f0");
    });

    it("ignores hidden segments", () => {
        const {ctx} = createMockCanvasContext();
        const display = new Display();
        const line = display.resolveLine(ctx, [{content: "visible"}, {content: "hidden", hidden: true}]);
        expect(line.runs.length).toBe(1);
        expect(line.width).toBe(70);
    });

    it("layouts a padded block from measured line widths", () => {
        const {ctx} = createMockCanvasContext();
        const display = new Display({fontSize: 10});
        const block = display.layoutBlock(ctx, [[{content: "abc"}], [{content: "abcdefgh"}]], 2);

        expect(block.width).toBe(84);
        expect(block.height).toBe(24);
    });

    it("drawLine paints run backgrounds, text, and underline", () => {
        const {ctx, ops} = createMockCanvasContext();
        const display = new Display();
        display.drawLine(ctx, [{run: {text: "x", foreground: "#fff", background: "#000", font: "12px mono", fontSize: 12, underline: true}, width: 10}], 5, 6, 12);

        expect(ops.some((op) => op.kind === "fillRect" && op.args[0] === 5 && op.args[1] === 6)).toBe(true);
        expect(ops.some((op) => op.kind === "fillText" && op.args[0] === 5 && op.args[1] === 6)).toBe(true);
        expect(ops.some((op) => op.kind === "stroke")).toBe(true);
    });
});

