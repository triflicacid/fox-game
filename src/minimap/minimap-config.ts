import {fieldRegistry, nonNegativeInteger, positiveNumber} from "../fields/field-registry";

export const MINIMAP_CONFIG = {
    /** Width/height of the minimap's square box, in canvas pixels. */
    boxSizePx: 180,
    /** Gap between the minimap and the canvas's top/right edges, in canvas pixels. */
    margin: 12,
    /** Gap between the minimap's left edge and the noise-field legend, when both are showing, in canvas pixels. */
    legendGap: 8,
    /**
     * How many world tiles one minimap pixel represents at the camera's
     * default zoom (1x). This is devided by the camera's zoom.
     */
    worldTilesPerPixel: 3,
    /** Size, in minimap screen pixels, of the square patch that shares one colour sample */
    sampleBlockPx: 4,

    /** Stroke colour for the minimap's border. */
    borderColor: "#ffffff",
    /** Stroke width for the minimap's border, in canvas pixels. */
    borderWidth: 2,

    /** Fill/stroke colour for the player marker (centre dot + facing wedge). */
    playerMarkerColor: "#ff3333",
    /** Radius of the player marker's centre dot, in canvas pixels. */
    playerMarkerRadiusPx: 3,
    /** Length of the player marker's facing wedge, in canvas pixels. */
    playerMarkerWedgeLengthPx: 8,
    /** Stroke width of the player marker's facing wedge, in canvas pixels. */
    playerMarkerWedgeWidth: 2,

    /** Gap between the minimap's bottom edge and the stats HUD below it (debug mode only), in canvas pixels. */
    statsHudGap: 8,
    /** Radius of the stats HUD's biome-distribution pie chart, in canvas pixels. */
    statsPieRadiusPx: 32,
    /** Samples per axis (so `statsBiomeSampleGrid`² total) used to tally biome distribution for the stats HUD - independent of `sampleBlockPx`, since it doesn't need to match the bitmap's own resolution, only be cheap enough for a per-frame, debug-only readout. */
    statsBiomeSampleGrid: 16,
};

fieldRegistry.registerFields("minimap", MINIMAP_CONFIG, {
    boxSizePx: nonNegativeInteger(),
    margin: nonNegativeInteger(),
    legendGap: nonNegativeInteger(),
    worldTilesPerPixel: positiveNumber(),
    sampleBlockPx: nonNegativeInteger(),
    borderWidth: nonNegativeInteger(),
    playerMarkerRadiusPx: nonNegativeInteger(),
    playerMarkerWedgeLengthPx: nonNegativeInteger(),
    playerMarkerWedgeWidth: nonNegativeInteger(),
    statsHudGap: nonNegativeInteger(),
    statsPieRadiusPx: nonNegativeInteger(),
    statsBiomeSampleGrid: nonNegativeInteger(),
});
