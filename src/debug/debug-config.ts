/**
 * Colours, line widths, and layout used by the debug rendering overlay
 * (toggled with the `d` key - see {@link DebugController}). Edit these
 * values to restyle it; nothing else needs to change.
 */
export const DEBUG_CONFIG = {
    /** Stroke colour for chunk outlines. */
    chunkOutlineColor: "#ff0000",
    /** Stroke width for chunk outlines, in canvas pixels. */
    chunkOutlineWidth: 3,
    /** Text colour for a chunk's coordinate label. */
    chunkLabelColor: "#ff0000",
    /** Font for a chunk's coordinate label. */
    chunkLabelFont: "12px monospace",
    /** Padding between a chunk's top-left corner and its coordinate label, in canvas pixels. */
    chunkLabelPadding: 4,

    /** Stroke colour for tile outlines. */
    tileOutlineColor: "#00ff00",
    /** Stroke width for tile outlines, in canvas pixels. */
    tileOutlineWidth: 1,

    /** Stroke colour for entity bounding boxes. */
    boundingBoxColor: "#3399ff",
    /** Stroke width for entity bounding boxes, in canvas pixels. */
    boundingBoxWidth: 2,

    /** Colour of an entity's facing-direction arrow. */
    facingArrowColor: "#3399ff",
    /** Stroke width of an entity's facing-direction arrow, in canvas pixels. */
    facingArrowWidth: 2,

    /** Text colour for the HUD (camera/viewport/entity readout). */
    hudTextColor: "#ffffff",
    /** Background colour behind the HUD text. */
    hudBackgroundColor: "rgba(0, 0, 0, 0.5)",
    /** Font for the HUD text. */
    hudFont: "14px monospace",
    /** Padding around the HUD text block, in canvas pixels. */
    hudPadding: 8,
    /** Vertical spacing between HUD lines, in canvas pixels. */
    hudLineHeight: 18,
} as const;
