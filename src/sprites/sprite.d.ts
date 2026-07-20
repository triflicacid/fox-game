import {Rect} from "../geometry/rect";

/** A rectangular region within a sprite sheet image, in pixels. */
export type SpriteRect = Rect;

/** A point relative to a sprite cell's centre, in pixels. */
export interface SpritePoint {
    x: number;
    y: number;
}

/**
 * A collision bounding shape for a sprite frame: a convex polygon (its
 * vertices, relative to the cell's centre, in clockwise order as seen in
 * the sheet's own pixel space, where y increases downward, same as
 * {@link SpriteRect}).
 */
export interface SpriteBounds {
    /** This shape's vertices, relative to the cell centre, in clockwise order (see above). */
    points: SpritePoint[];
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
    /**
     * Extra clockwise rotation, in radians, to draw this frame with around
     * its own centre - on top of whatever direction the underlying art was
     * drawn for.
     */
    readonly rotation?: number;
}

/**
 * A single, located static tile within a sprite sheet.
 * Unlike {@link SpriteFrame}, it carries no animation state,
 * since a tile sheet's entries (see {@link SpriteTileDescriptor}) are
 * never animated.
 */
export interface SpriteTile extends SpriteRect {
    /** This tile's collision bounding box, or `undefined` if it has no collision shape (e.g. ground). */
    readonly bounds?: SpriteBounds;
}