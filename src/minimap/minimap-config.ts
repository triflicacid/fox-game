import {fieldRegistry, nonNegativeInteger, positiveNumber} from "../fields/field-registry";

/**
 * Layout, scale, and colour constants for the always-on biome-overview
 * minimap (see `Minimap`), registered for live tuning the same way
 * `debug-config.ts`/`fox-constants.ts`/`spectator-constants.ts` are. Edit
 * these values to restyle/rescale it; nothing else needs to change.
 */
export const MINIMAP_CONFIG = {
    /** Width/height of the minimap's square box, in canvas pixels. */
    boxSizePx: 180,
    /** Gap between the minimap and the canvas's top/right edges, in canvas pixels. */
    margin: 12,
    /** Gap between the minimap's left edge and the noise-field legend, when both are showing, in canvas pixels. */
    legendGap: 8,
    /** How many world tiles one minimap pixel represents - independent of the camera's own zoom. */
    worldTilesPerPixel: 3,
    /**
     * How many minimap pixels square one biome/noise-field sample covers - a
     * block this size is filled from a single `resolveBiomeTagAt`/noise-field
     * lookup, cutting sample count by its square for a given box size.
     * Deliberately not derived from `CHUNK_SIZE` - see `plans/minimap.md`
     * 3.1. Ought to evenly divide `boxSizePx` for a clean grid, though
     * nothing breaks if it doesn't.
     */
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
});
