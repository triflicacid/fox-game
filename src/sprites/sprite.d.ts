/** A rectangular region within a sprite sheet image, in pixels. */
export interface SpriteRect {
    /** Left edge, in pixels from the sheet's left edge. */
    x: number;
    /** Top edge, in pixels from the sheet's top edge. */
    y: number;
    /** Width, in pixels. */
    w: number;
    /** Height, in pixels. */
    h: number;
}

/**
 * A collision bounding box for a sprite frame, , expressed relative to the
 * cell's centre.
 * Shared by every phase of a given animation (see {@link SpriteRowDescriptor.bounds})
 * rather than per-frame as bounding box stays the same throughout.
 */
export interface SpriteBounds {
    /** Left edge's horizontal offset from the cell centre, in pixels (negative extends left). */
    offsetX: number;
    /** Top edge's vertical offset from the cell centre, in pixels (negative extends up). */
    offsetY: number;
    /** Width, in pixels. */
    width: number;
    /** Height, in pixels. */
    height: number;
}

/**
 * A single, located frame of some animation within a sprite sheet.
 *
 * Carries its own frame index/count so that {@link SpriteSheet.next} and
 * {@link SpriteSheet.previous} can step through the animation generically:
 * callers don't need to know how many frames the animation has.
 */
export interface SpriteFrame extends SpriteRect {
    /** 0-indexed position of this frame within its animation. */
    readonly frameIndex: number;
    /** Total number of frames in this frame's animation. */
    readonly frameCount: number;
    /**
     * Whether stepping past the last frame wraps back to the first (a
     * repeating cycle) rather than holding on the last frame (a one-shot
     * animation). See {@link AnimatedSpriteSheet.next}.
     */
    readonly loops: boolean;
    /** This frame's collision bounding box (shared across its whole animation). */
    readonly bounds: SpriteBounds;
}

/**
 * A single, located static tile within a sprite sheet.
 * Unlike {@link SpriteFrame}, it carries no animation state,
 * since a tile sheet's entries (see {@link SpriteTileDescriptor}) are
 * never animated.
 */
export interface SpriteTile extends SpriteRect {
    /** This tile's collision bounding box. */
    readonly bounds: SpriteBounds;
}