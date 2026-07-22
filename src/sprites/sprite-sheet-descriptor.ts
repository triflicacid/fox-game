import {SpriteBounds} from "./sprite";

/**
 * Base fields shared by every sprite sheet entry, whatever kind of content it
 * holds.
 * Entries are searched by `type` rather than relied on to
 * sit at any particular index.
 *
 * A single sheet is always entirely one kind of entry - a plain
 * {@link SpriteTileDescriptor} for static content with no animation (e.g. a
 * tree, a patch of gravel), or a {@link SpriteRowDescriptor} for an animated
 * one (e.g. a walk cycle) - never a mix of both, so
 * {@link SpriteSheetDescriptor} takes the concrete entry shape as a type
 * parameter rather than trying to describe both at once.
 *
 * @typeParam TType - Union of valid `type` values for this sheet's entries.
 */
export interface SpriteTileDescriptor<TType extends string = string> {
    /** Identifier for this entry, matched against a lookup's `type` argument. */
    type: TType;
    /** Pixel x (left edge) of this entry's cell. */
    x: number;
    /** Pixel y (top edge) of this entry's cell. */
    y: number;
    /**
     * Collision bounding shape relative to the cell's centre. Absent for a
     * non-interactable entry.
     */
    bounds?: SpriteBounds;
}

/**
 * A {@link SpriteTileDescriptor} that plays back as a multi-phase animation
 * (e.g. a walk cycle) rather than being a single static image.
 *
 * @typeParam TType - Union of valid `type` values for this sheet's entries.
 */
export interface SpriteRowDescriptor<TType extends string = string> extends SpriteTileDescriptor<TType> {
    /** Collision bounding shape relative to the cell's centre, shared across every phase - always present, narrowing the base's optional field. */
    bounds: SpriteBounds;
    /** Number of animation phases (columns starting at `x`). */
    phases: number;
    /**
     * Whether stepping past the last phase wraps back to the first (a cycle animation)
     * rather than holding on the last phase (a static animation.
     */
    loops: boolean;
    /**
     * Milliseconds each phase remains visible. When absent, the entity uses
     * its default animation interval, preserving existing sheet behaviour.
     */
    frameIntervalMs?: number;
    /**
     * Pixel x of a static "idle" frame for this row - shown when not
     * animating but has the same `type` - if it has one.
     */
    idleX?: number;
}

/**
 * Full description of a sprite sheet's layout: every entry it contains, plus
 * the common cell size all entries share.
 *
 * @typeParam TType - Union of valid `type` values for this sheet's entries.
 * @typeParam TEntry - Concrete entry shape this sheet uses: {@link SpriteRowDescriptor}
 * for an animated sheet (the default, e.g. the fox), or plain
 * {@link SpriteTileDescriptor} for a sheet of static tiles (e.g. trees, gravel).
 */
export interface SpriteSheetDescriptor<
    TType extends string = string,
    TEntry extends SpriteTileDescriptor<TType> = SpriteRowDescriptor<TType>,
> {
    /** Width, in pixels, of every cell in this sheet. */
    cellWidth: number;
    /** Height, in pixels, of every cell in this sheet. */
    cellHeight: number;
    /** Every entry in this sheet. */
    rows: TEntry[];
}
