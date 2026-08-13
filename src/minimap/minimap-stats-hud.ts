import {InteractableDisplay} from "@display/interactable-display";
import {FLAT_THEME} from "@display/flat-theme";
import {DisplayLine, PieChartClass, PieChartInput} from "@display/input";
import {hr, line} from "@display/builders";
import {DEBUG_CONFIG} from "../debug/debug-config";
import {HudBase} from "../debug/hud-base";
import {MINIMAP_CONFIG} from "./minimap-config";
import {BIOME_COLORS} from "../world/generation/biome/biome-colors";
import {BIOME_TAGS, BiomeTag} from "../world/generation/biome/biome";

/** Display label per {@link BiomeTag}, for the pie chart's legend. */
const BIOME_LABELS: Record<BiomeTag, string> = {
    plains: "Plains",
    desert: "Desert",
    forest: "Forest",
    tundra: "Tundra",
};

/** Everything {@link MinimapStatsHud.draw} needs for one frame. */
export interface MinimapStatsHudData {
    /** World-tile bounds the minimap currently covers - see `World.buildMinimapData`'s `worldTilesPerPixel`. */
    minTileX: number;
    minTileY: number;
    maxTileX: number;
    maxTileY: number;
    /** How many world tiles one minimap pixel currently represents (see `MinimapData.worldTilesPerPixel`). */
    worldTilesPerPixel: number;
    /** How many of the sample grid's points resolved to each biome tag, within the bounds above. */
    biomeCounts: Record<BiomeTag, number>;
}

/** Renders one minimap statistics snapshot. */
export interface MinimapStatsHudRenderer {
    /** Draws the supplied statistics data. */
    draw(ctx: CanvasRenderingContext2D, canvasWidth: number, data: MinimapStatsHudData): void;
}

/** A second, debug-only mini HUD anchored below the minimap. */
export class MinimapStatsHud extends HudBase implements MinimapStatsHudRenderer {
    /** No keyboard/mouse wiring, `"click"` focus mode, and no focusables ever registered - this panel is a static, read-only readout, never interactive, so `InteractableDisplay`'s input-handling machinery just stays dormant. Used only for its `piechart` element support (`Display` alone can't lay one out). */
    private readonly display = new InteractableDisplay(
        {foreground: DEBUG_CONFIG.hudTextColor, fontFamily: DEBUG_CONFIG.hudFontFamily, fontSize: DEBUG_CONFIG.hudFontSize},
        FLAT_THEME,
        "click",
        null,
    );


    /**
     * Builds this frame's biome-distribution pie chart classes from
     * `data.biomeCounts`.
     */
    private buildBiomeClasses(data: MinimapStatsHudData): PieChartClass[] {
        return BIOME_TAGS.map((tag) => {
            const [r, g, b] = BIOME_COLORS[tag];
            const value = data.biomeCounts[tag] ?? 0;
            return {
                key: tag,
                value,
                fillColor: `rgb(${r}, ${g}, ${b})`,
                label: BIOME_LABELS[tag],
                hidden: value === 0,
            };
        });
    }

    /** Builds this frame's content: the minimap's world-tile viewport readout, then its biome-distribution pie chart. */
    private buildLines(data: MinimapStatsHudData): DisplayLine[] {
        const pieChart: PieChartInput = {
            kind: "piechart",
            classes: this.buildBiomeClasses(data),
            radius: MINIMAP_CONFIG.statsPieRadiusPx,
            legend: {auto: true, side: "right", showValue: "percentage", percentageDecimals: 1},
        };

        return [
            line()
                .content(this.text("("))
                .content(this.numberValue(data.minTileX.toFixed(0)))
                .content(this.text(", "))
                .content(this.numberValue(data.minTileY.toFixed(0)))
                .content(this.text(") to ("))
                .content(this.numberValue(data.maxTileX.toFixed(0)))
                .content(this.text(", "))
                .content(this.numberValue(data.maxTileY.toFixed(0)))
                .content(this.text(")")),
            line()
                .content(this.text("scale: "))
                .content(this.numberValue((data.maxTileX - data.minTileX).toFixed(0)))
                .content(this.text(" x "))
                .content(this.numberValue((data.maxTileY - data.minTileY).toFixed(0)))
                .content(this.text(" tiles")),
            line()
                .content(this.text("scale: "))
                .content(this.numberValue(data.worldTilesPerPixel.toFixed(2)))
                .content(this.text(" tiles/px")),
            line()
                .content(this.text("samples: "))
                .content(this.numberValue(String(MINIMAP_CONFIG.statsBiomeSampleGrid)))
                .content(this.text("x"))
                .content(this.numberValue(String(MINIMAP_CONFIG.statsBiomeSampleGrid)))
                .content(this.text(" = "))
                .content(this.numberValue(String(MINIMAP_CONFIG.statsBiomeSampleGrid ** 2))),
            line()
                .content(hr({ length: "max" })),
            line()
                .content(this.text("Biome distribution")),
            line()
                .content(pieChart),
        ];
    }

    /**
     * Draws the stats HUD, right-aligned the same way the minimap itself is,
     * immediately below it.
     *
     * @param ctx - Canvas context to draw into.
     * @param canvasWidth - Canvas width, in canvas pixels, for right-alignment.
     * @param data - This frame's stats data - see {@link MinimapStatsHudData}.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, data: MinimapStatsHudData): void {
        this.setupContext(ctx);

        const padding = DEBUG_CONFIG.hudPadding;

        // Reset the focus-index counter resolveLines' piechart legend rows
        // consume - required once per resolve pass, even though nothing here
        // is ever actually focused (see the `display` field's own doc comment).
        this.display.beginResolvePass();
        const lines = this.buildLines(data);
        const {rows, width: contentWidth, height: contentHeight} = this.display.resolveLines(ctx, lines, DEBUG_CONFIG.hudLineSpacing);

        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;
        const boxRight = canvasWidth - MINIMAP_CONFIG.margin;
        const boxTop = MINIMAP_CONFIG.margin + MINIMAP_CONFIG.boxSizePx + MINIMAP_CONFIG.statsHudGap;
        const boxLeft = boxRight - width;

        this.drawBackground(ctx, boxLeft, boxTop, width, height);

        this.display.drawLines(ctx, rows, boxLeft + padding, boxTop + padding, DEBUG_CONFIG.hudLineSpacing);
    }
}
