import {beforeEach, describe, expect, it, vi} from "vitest";
import {InteractableDisplay} from "./interactable-display";
import {FLAT_THEME} from "./flat-theme";
import {FocusableElement} from "./interactable-display";
import {DisplayLine} from "./input";
import {createMockCanvasContext} from "./test-helpers/mock-canvas";

function focusable(x: number, y: number, w: number, h: number): FocusableElement {
    return {rect: {x, y, w, h}, activate: () => undefined, disabled: false};
}

describe("InteractableDisplay basic state and geometry", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "window", {
            value: {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            configurable: true,
        });
    });

    it("tracks active and focused state for always mode", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        expect(display.isActive()).toBe(false);
        expect(display.isFocused()).toBe(false);

        display.setActive(true);
        expect(display.isActive()).toBe(true);
        expect(display.isFocused()).toBe(true);

        display.setActive(false);
        expect(display.isActive()).toBe(false);
        expect(display.isFocused()).toBe(false);
    });

    it("merges focusables top-down then left-to-right", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "click");
        const merged = display.mergeFocusables(
            [focusable(20, 20, 1, 1), focusable(5, 50, 1, 1)],
            [focusable(10, 20, 1, 1), focusable(1, 10, 1, 1)],
        );

        expect(merged.map((f) => [f.rect.x, f.rect.y])).toEqual([
            [1, 10],
            [10, 20],
            [20, 20],
            [5, 50],
        ]);
    });

    it("computes occupied bounds from focusables", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "click");
        display.setFocusables([
            focusable(10, 10, 5, 4),
            focusable(20, 7, 3, 2),
        ]);

        expect(display.getOccupiedBounds()).toEqual({x: 10, y: 7, w: 13, h: 7});
    });
});

describe("InteractableDisplay pie chart", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "window", {
            value: {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            configurable: true,
        });
    });

    it("resolves wedge angles proportional to visible classes' values, skipping hidden/zero-value ones", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const {ctx} = createMockCanvasContext();
        const line: DisplayLine = [{
            kind: "piechart",
            radius: 10,
            classes: [
                {key: "a", value: 3, fillColor: "#ff0000"},
                {key: "b", value: 1, fillColor: "#00ff00", hidden: true},
                {key: "c", value: 0, fillColor: "#0000ff"},
                {key: "d", value: 1, fillColor: "#ffff00"},
            ],
        }];

        display.beginResolvePass();
        const {elements} = display.resolveElements(ctx, line);
        const element = elements[0];
        if (element.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }

        // Only "a" (3) and "d" (1) are visible - 4 total, so "a" gets 3/4 of
        // the circle starting at 12 o'clock (-π/2), "d" the remaining 1/4.
        expect(element.wedges).toHaveLength(2);
        expect(element.wedges[0].startAngle).toBeCloseTo(-Math.PI / 2);
        expect(element.wedges[0].endAngle).toBeCloseTo(Math.PI);
        expect(element.wedges[1].startAngle).toBeCloseTo(Math.PI);
        expect(element.wedges[1].endAngle).toBeCloseTo(Math.PI * 1.5);
    });

    it("auto-generates a legend from non-hidden classes and scales radius/outline/gap/swatch together", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const {ctx} = createMockCanvasContext();
        const line: DisplayLine = [{
            kind: "piechart",
            radius: 10,
            outlineThickness: 2,
            scale: 2,
            classes: [
                {key: "a", value: 1, fillColor: "#ff0000", label: "Alpha"},
                {key: "b", value: 1, fillColor: "#00ff00", hidden: true},
            ],
            legend: {auto: true, gap: 4},
        }];

        display.beginResolvePass();
        const {elements} = display.resolveElements(ctx, line);
        const element = elements[0];
        if (element.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }

        expect(element.radius).toBe(20);
        expect(element.outlineThickness).toBe(4);
        expect(element.legendGap).toBe(8);
        expect(element.swatchSize).toBe(20);
        expect(element.legend).toHaveLength(1);
        expect(element.legend?.[0].color).toBe("#ff0000");
        expect(element.legend?.[0].runs[0]?.run.text).toBe("Alpha");
    });

    it("suffixes auto legend rows per `showValue`, against the non-hidden classes' total", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const classes = [
            {key: "a", value: 3, fillColor: "#ff0000"},
            {key: "b", value: 1, fillColor: "#00ff00"},
        ];

        const percentageLine: DisplayLine = [{kind: "piechart", radius: 10, classes, legend: {auto: true, showValue: "percentage"}}];
        display.beginResolvePass();
        const percentageElement = display.resolveElements(createMockCanvasContext().ctx, percentageLine).elements[0];
        if (percentageElement.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(percentageElement.legend?.map((row) => row.runs[0]?.run.text)).toEqual(["a (75%)", "b (25%)"]);

        const valueLine: DisplayLine = [{kind: "piechart", radius: 10, classes, legend: {auto: true, showValue: "value"}}];
        display.beginResolvePass();
        const valueElement = display.resolveElements(createMockCanvasContext().ctx, valueLine).elements[0];
        if (valueElement.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(valueElement.legend?.map((row) => row.runs[0]?.run.text)).toEqual(["a (3)", "b (1)"]);

        const noneLine: DisplayLine = [{kind: "piechart", radius: 10, classes, legend: {auto: true}}];
        display.beginResolvePass();
        const noneElement = display.resolveElements(createMockCanvasContext().ctx, noneLine).elements[0];
        if (noneElement.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(noneElement.legend?.map((row) => row.runs[0]?.run.text)).toEqual(["a", "b"]);
    });

    it("formats `showValue: \"percentage\"` to `percentageDecimals` places, defaulting to whole percentages", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const classes = [
            {key: "a", value: 1, fillColor: "#ff0000"},
            {key: "b", value: 2, fillColor: "#00ff00"},
        ];

        const defaultLine: DisplayLine = [{kind: "piechart", radius: 10, classes, legend: {auto: true, showValue: "percentage"}}];
        display.beginResolvePass();
        const defaultElement = display.resolveElements(createMockCanvasContext().ctx, defaultLine).elements[0];
        if (defaultElement.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(defaultElement.legend?.map((row) => row.runs[0]?.run.text)).toEqual(["a (33%)", "b (67%)"]);

        const decimalLine: DisplayLine = [{kind: "piechart", radius: 10, classes, legend: {auto: true, showValue: "percentage", percentageDecimals: 1}}];
        display.beginResolvePass();
        const decimalElement = display.resolveElements(createMockCanvasContext().ctx, decimalLine).elements[0];
        if (decimalElement.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(decimalElement.legend?.map((row) => row.runs[0]?.run.text)).toEqual(["a (33.3%)", "b (66.7%)"]);
    });

    it("applies `showValue` to a manual legend row too, since every row is tied to a class - and drops an entry whose `key` matches no class", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const {ctx} = createMockCanvasContext();
        const line: DisplayLine = [{
            kind: "piechart",
            radius: 10,
            classes: [
                {key: "a", value: 3, fillColor: "#ff0000"},
                {key: "b", value: 1, fillColor: "#00ff00"},
            ],
            legend: {
                entries: [
                    {key: "a", content: "Red"},
                    {key: "missing", content: "Ghost"},
                ],
                showValue: "percentage",
            },
        }];

        display.beginResolvePass();
        const element = display.resolveElements(ctx, line).elements[0];
        if (element.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        // "missing" matches no class - it acts as absent, same as `hidden`
        // would. "a" is suffixed against every visible class's total (3 of
        // 4 => 75%), and its swatch falls back to the class's own
        // `fillColor` since the entry set none.
        expect(element.legend).toHaveLength(1);
        expect(element.legend?.[0].runs[0]?.run.text).toBe("Red (75%)");
        expect(element.legend?.[0].color).toBe("#ff0000");
    });

    it("positions a manual left-side legend beside the pie and gives its row a focusable, tied to its class", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const {ctx} = createMockCanvasContext();
        const line: DisplayLine = [{
            kind: "piechart",
            radius: 10,
            classes: [{key: "a", value: 1, fillColor: "#ff0000"}],
            legend: {entries: [{key: "a", content: "Red"}], side: "left"},
        }];

        display.beginResolvePass();
        const {rows} = display.resolveLines(ctx, [line], 4);
        const focusables = display.layoutFocusables(rows[0], 0, 0);
        expect(focusables).toHaveLength(1);

        const element = rows[0].elements[0];
        if (element.kind !== "piechart") {
            throw new Error("Expected a resolved piechart element");
        }
        expect(element.legendSide).toBe("left");
        expect(element.width).toBeGreaterThan(element.radius * 2);
    });

    it("paints one arc per wedge and one swatch per legend row", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        const {ctx, ops} = createMockCanvasContext();
        const line: DisplayLine = [{
            kind: "piechart",
            radius: 10,
            classes: [
                {key: "a", value: 1, fillColor: "#ff0000"},
                {key: "b", value: 1, fillColor: "#00ff00"},
            ],
            legend: {auto: true},
        }];

        display.beginResolvePass();
        const {rows} = display.resolveLines(ctx, [line], 4);
        display.drawElements(ctx, rows[0], 0, 0);

        expect(ops.filter((op) => op.kind === "arc")).toHaveLength(2);
        expect(ops.filter((op) => op.kind === "fillRect" && op.args[2] === 10 && op.args[3] === 10)).toHaveLength(2);
    });
});

