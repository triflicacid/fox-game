import {COLORS} from "@display/colors";
import {fieldRegistry, nonNegativeInteger} from "../fields/field-registry";

/**
 * Colours, line widths, and layout used by the debug rendering overlay
 * (toggled with the `d` key - see {@link DebugController}). Edit these
 * values to restyle it; nothing else needs to change.
 */
export const DEBUG_CONFIG = {
    /** Stroke colour for chunk outlines. */
    chunkOutlineColor: "#ff0000",
    /** Stroke colour for a chunk outline while that chunk hasn't finished generating yet. */
    chunkPendingOutlineColor: "#3399ff",
    /** Stroke width for chunk outlines, in canvas pixels. */
    chunkOutlineWidth: 2,
    /** Text colour for a chunk's coordinate label. */
    chunkLabelColor: "#ff0000",
    /** Font for a chunk's coordinate label. */
    chunkLabelFont: "12px monospace",
    /** Padding between a chunk's top-left corner and its coordinate label, in canvas pixels. */
    chunkLabelPadding: 4,
    /** Font for a still-generating chunk's queue position, drawn centred in the chunk. */
    chunkQueuePositionFont: "bold 16px monospace",

    /** Stroke colour for feature-tag boundary outlines (e.g. lake edges). */
    featureOutlineColor: "#ff8800",
    /** Stroke width for feature-tag boundary outlines, in canvas pixels. */
    featureOutlineWidth: 1,

    /** Stroke colour for structure-piece boundary outlines (e.g. tree footprints). */
    structureOutlineColor: "#00e5ff",
    /** Stroke width for structure-piece boundary outlines, in canvas pixels. */
    structureOutlineWidth: 1,

    /** Stroke colour for biome-tag boundary outlines. */
    biomeOutlineColor: "#d946ef",
    /** Stroke width for biome-tag boundary outlines, in canvas pixels. */
    biomeOutlineWidth: 2,

    /** Stroke colour for entity bounding boxes. */
    boundingBoxColor: "#3399ff",
    /** Stroke width for entity bounding boxes, in canvas pixels. */
    boundingBoxWidth: 2,

    /** Colour of an entity's facing-direction arrow. */
    facingArrowColor: "#3399ff",
    /** Stroke width of an entity's facing-direction arrow, in canvas pixels. */
    facingArrowWidth: 2,

    /** Text colour for the HUD's labels (camera/viewport/entity readout). */
    hudTextColor: "#ffffff",
    /** Text colour for the HUD's string-valued values (e.g. a feature tag, biome name, facing direction). */
    hudStringValueColor: COLORS.brightYellow,
    /** Text colour for the HUD's numeric-valued values. */
    hudNumberValueColor: COLORS.brightGreen,
    /** Text colour for a still-generating neighbouring chunk indicator in the HUD. */
    hudChunkGeneratingColor: "#3399ff",
    /** Text colour for an unloaded neighbouring chunk indicator in the HUD. */
    hudChunkUnloadedColor: "#666666",
    /** Text colour for the HUD's spectator-mode indicator. */
    hudSpectatorColor: "#ffff00",
    /** Text colour for the HUD's collision indicator when a collision is currently happening. */
    hudCollisionTrueColor: "lime",
    /** Text colour for the HUD's collision indicator when no collision is currently happening. */
    hudCollisionFalseColor: "tomato",
    /** Background colour behind the HUD text. */
    hudBackgroundColor: "rgba(0, 0, 0, 0.5)",
    /** Font family for the HUD text. */
    hudFontFamily: "monospace",
    /** Font size for the HUD text, in canvas pixels. */
    hudFontSize: 14,
    /** Padding around the HUD text block, in canvas pixels. */
    hudPadding: 8,
    /** Vertical gap placed between consecutive HUD lines, in canvas pixels. */
    hudLineSpacing: 6,

    /** Horizontal offset from the cursor to the hover tooltip's near edge, in canvas pixels - see {@link HoverTooltip}. */
    tooltipOffsetX: 14,
    /** Vertical offset from the cursor to the hover tooltip's near edge, in canvas pixels - see {@link HoverTooltip}. */
    tooltipOffsetY: 14,

    /** Width of the noise-field legend's colour bar, in canvas pixels. */
    noiseLegendBarWidth: 20,
    /** Height of the noise-field legend's colour bar, in canvas pixels. */
    noiseLegendBarHeight: 160,
    /** Gap between the noise-field legend and the canvas's top/right edges, in canvas pixels. */
    noiseLegendMargin: 12,
    /** Padding between the noise-field legend's background and its bar/labels, in canvas pixels. */
    noiseLegendPadding: 8,
    /** Length of each tick mark on the noise-field legend's bar, in canvas pixels. */
    noiseLegendTickLength: 6,
    /** Gap between a noise-field legend tick mark and its label, in canvas pixels. */
    noiseLegendLabelGap: 4,
    /** Stroke colour for the noise-field legend's bar border and tick marks. */
    noiseLegendLineColor: "#ffffff",
    /** Text colour for the noise-field legend's labels. */
    noiseLegendTextColor: "#ffffff",
    /** Background colour behind the noise-field legend. */
    noiseLegendBackgroundColor: "rgba(0, 0, 0, 0.5)",
    /** Font for the noise-field legend's labels. */
    noiseLegendFont: "12px monospace",
};

fieldRegistry.registerFields("debug", DEBUG_CONFIG, {
    chunkOutlineWidth: nonNegativeInteger(),
    chunkLabelPadding: nonNegativeInteger(),
    featureOutlineWidth: nonNegativeInteger(),
    structureOutlineWidth: nonNegativeInteger(),
    biomeOutlineWidth: nonNegativeInteger(),
    boundingBoxWidth: nonNegativeInteger(),
    facingArrowWidth: nonNegativeInteger(),
    hudFontSize: nonNegativeInteger(),
    hudPadding: nonNegativeInteger(),
    hudLineSpacing: nonNegativeInteger(),
    tooltipOffsetX: nonNegativeInteger(),
    tooltipOffsetY: nonNegativeInteger(),
    noiseLegendBarWidth: nonNegativeInteger(),
    noiseLegendBarHeight: nonNegativeInteger(),
    noiseLegendMargin: nonNegativeInteger(),
    noiseLegendPadding: nonNegativeInteger(),
    noiseLegendTickLength: nonNegativeInteger(),
    noiseLegendLabelGap: nonNegativeInteger(),
});
