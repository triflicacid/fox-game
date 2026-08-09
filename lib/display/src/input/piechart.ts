import {TextSegment, TextStyle} from "../text-style";
import {ElementBase} from "./base";

/** One wedge's data: its share of the whole (`value`, relative to every other class's `value`) plus its own fill/outline colours. */
export interface PieChartClass {
    /** Uniquely identifies this class - the fallback legend label when `auto`-generated. */
    key: string;
    /** This class's share of the chart, relative to the sum of every class's `value`. `0` draws no wedge. */
    value: number;
    /** Wedge fill colour. */
    fillColor: string;
    /** Wedge outline colour, or unset for no outline. */
    outlineColor?: string;
    /** Wedge fill colour while this class's legend row is focused. Falls back to `fillColor` when unset. */
    selectedFillColor?: string;
    /** Wedge outline colour while this class's legend row is focused. Falls back to `outlineColor` when unset. */
    selectedOutlineColor?: string;
    /** Style overlaid on this class's legend row while it's focused, on top of the legend's own `style`. Unset is a no-op. */
    selectedStyle?: TextStyle;
    /** Label for this class's legend row, unless a manual {@link PieChartLegendEntry} overrides it. Defaults to `key`. */
    label?: string | TextSegment[];
    /** If `true`, this class acts as if absent entirely - no wedge, no legend row. Defaults to `false`. */
    hidden?: boolean;
    /** Invoked when this class's legend row is activated (click, or Enter/Space while focused). No other built-in effect. */
    onClick?: () => void;
}

/**
 * One legend row referencing a {@link PieChartClass} by `key` - a `key`
 * matching no class (or a `hidden` one) makes the row act as absent. Every
 * other field overrides that class's own presentation, for this row only.
 */
export interface PieChartLegendEntry {
    /** The class this row represents - must match a {@link PieChartClass.key} among the owning chart's `classes`. */
    key: string;
    /** Swatch colour override. Defaults to the referenced class's `fillColor`. */
    color?: string;
    /** Label override. Defaults to the referenced class's `label` (or `key`). */
    content?: string | TextSegment[];
    /** This row's own text colour override. Falls back to the owning legend's `style.foreground`, then the theme default. */
    style?: TextStyle;
    /** If `true`, this row acts as if absent entirely. Defaults to `false`. */
    hidden?: boolean;
}

/** Which side of the pie a {@link PieChartLegend} is drawn on. */
export type PieChartLegendSide = "left" | "right" | "top" | "bottom";

/** What (if anything) to append after each legend row's label. */
export type PieChartLegendValueDisplay = "percentage" | "value" | "none";

/** Fields shared by both {@link PieChartLegend} variants. */
interface PieChartLegendBase {
    /** Which side of the pie the legend is drawn on. Defaults to `"right"`. */
    side?: PieChartLegendSide;
    /** Gap between the pie and the legend, in canvas pixels, before {@link PieChartInput.scale}. Defaults to `8`. */
    gap?: number;
    /** Default legend text colour for rows that don't set their own `style.foreground`. Falls back to the theme default. */
    style?: TextStyle;
    /** Appends each row's share of the total as a percentage, its class's raw `value`, or nothing. Defaults to `"none"`. */
    showValue?: PieChartLegendValueDisplay;
}

/** A legend generated from {@link PieChartInput.classes}: one row per non-`hidden` class, in `classes` order. */
export interface AutoPieChartLegend extends PieChartLegendBase {
    auto: true;
}

/** A legend built from hand-supplied rows - which classes to show, in which order, with which overrides. */
export interface ManualPieChartLegend extends PieChartLegendBase {
    auto?: false;
    /** The rows to show, top to bottom (or left to right, per `side`). */
    entries: PieChartLegendEntry[];
}

/** A pie chart's legend: generated from its `classes` (`auto: true`) or hand-supplied (`entries`). */
export type PieChartLegend = AutoPieChartLegend | ManualPieChartLegend;

/**
 * A data-driven pie chart: one wedge per {@link PieChartClass}, sized by
 * its `value` relative to the others' total, plus an optional {@link
 * PieChartLegend}. Extends {@link ElementBase} rather than `InputBase`,
 * like {@link HrInput} - but a legend's rows are still individually
 * focusable/clickable, see {@link PieChartClass.onClick}.
 */
export interface PieChartInput extends ElementBase {
    kind: "piechart";
    /** The wedges to draw, clockwise from 12 o'clock, in array order. */
    classes: PieChartClass[];
    /** Pie radius, in canvas pixels, before `scale` is applied. */
    radius: number;
    /** Wedge outline thickness, in canvas pixels, before `scale` is applied. Defaults to `1`. */
    outlineThickness?: number;
    /** The chart's legend, or unset for none. */
    legend?: PieChartLegend;
    /** Uniformly scales the whole chart segment - pie, outline, gap, swatch, and legend text. Defaults to `1`. */
    scale?: number;
}
