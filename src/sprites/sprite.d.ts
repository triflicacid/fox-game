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
}