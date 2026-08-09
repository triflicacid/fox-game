import {TextSegment, TextStyle} from "../text-style";
import {ElementBase} from "./base";

/**
 * One wedge's data: its share of the whole (`value`, relative to every
 * other class's `value`) plus its own fill/outline colours.
 */
export interface PieChartClass {
    /** Uniquely identifies this class - the fallback legend label when the legend is `auto`-generated. */
    key: string;
    /** This class's share of the chart, relative to the sum of every class's `value`. `0` draws no wedge. */
    value: number;
    /** Wedge fill colour. */
    fillColor: string;
    /** Wedge outline colour, or unset for no outline. */
    outlineColor?: string;
    /** Label used when the legend is `auto`-generated. Defaults to `key`. */
    label?: string | TextSegment[];
    /** If `true`, this class acts as if absent entirely - no wedge, and no auto-generated legend row. Defaults to `false`. */
    hidden?: boolean;
}

/** One hand-supplied legend row: a colour swatch plus a label. */
export interface PieChartLegendEntry {
    /** Swatch colour. */
    color: string;
    /** Label content. */
    content: string | TextSegment[];
    /** This entry's own text colour. Falls back to the owning legend's `style.foreground`, then the theme default. */
    style?: TextStyle;
    /** If `true`, this entry acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}

/** Which side of the pie a {@link PieChartLegend} is drawn on. */
export type PieChartLegendSide = "left" | "right" | "top" | "bottom";

/** What (if anything) to append after each auto-generated legend row's label. */
export type PieChartLegendValueDisplay = "percentage" | "value" | "none";

/** Fields shared by both {@link PieChartLegend} variants. */
interface PieChartLegendBase {
    /** Which side of the pie the legend is drawn on. Defaults to `"right"`. */
    side?: PieChartLegendSide;
    /** Gap between the pie and the legend, in canvas pixels, before {@link PieChartInput.scale} is applied. Defaults to `8`. */
    gap?: number;
    /** Default legend text colour, applied to every row that doesn't set its own `style.foreground` - including auto-generated rows. Falls back to the theme default. */
    style?: TextStyle;
    /**
     * Appends each row's share of the total as a rounded percentage
     * (`"percentage"`), its class's raw `value` (`"value"`), or nothing
     * (`"none"`). Ignored on a {@link ManualPieChartLegend} - only `auto`
     * rows are generated from a class's `value`, so there's nothing to
     * format for a hand-supplied entry. Defaults to `"none"`.
     */
    showValue?: PieChartLegendValueDisplay;
}

/** A legend generated from {@link PieChartInput.classes}: one row per non-`hidden` class, swatched with its `fillColor`, labelled with its `label` (or `key`), in `classes` order. */
export interface AutoPieChartLegend extends PieChartLegendBase {
    auto: true;
}

/** A legend built from hand-supplied rows, independent of `classes`. */
export interface ManualPieChartLegend extends PieChartLegendBase {
    auto?: false;
    /** The rows to show, top to bottom (or left to right, per `side`). */
    entries: PieChartLegendEntry[];
}

/** A pie chart's legend: either generated from its `classes` (`auto: true`) or hand-supplied (`entries`). */
export type PieChartLegend = AutoPieChartLegend | ManualPieChartLegend;

/**
 * A data-driven pie chart: one wedge per {@link PieChartClass}, sized by its
 * `value` relative to the others' total, plus an optional {@link
 * PieChartLegend}. Purely decorative - never focusable, so it extends
 * {@link ElementBase} rather than `InputBase`, like {@link HrInput}. Not a
 * member of the {@link Input} union for the same reason - it carries no
 * interaction for `resolveInput`/`layoutInput`/`paintInput` to dispatch on.
 */
export interface PieChartInput extends ElementBase {
    kind: "piechart";
    /** The wedges to draw, clockwise from 12 o'clock, in array order. */
    classes: PieChartClass[];
    /** Pie radius, in canvas pixels, before `scale` is applied. */
    radius: number;
    /** Wedge outline thickness, in canvas pixels, before `scale` is applied. Defaults to `1`. No effect on a class with no `outlineColor`. */
    outlineThickness?: number;
    /** The chart's legend, or unset for none. */
    legend?: PieChartLegend;
    /** Uniformly scales the whole chart segment - pie, outline thickness, legend gap, swatch size, and legend text - up (`> 1`) or down (`< 1`) as one unit. Defaults to `1`. */
    scale?: number;
}
