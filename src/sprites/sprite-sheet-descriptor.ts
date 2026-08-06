import {SpriteBounds} from "./sprite";
import {CollisionResponseKind} from "../geometry/collision-response";

/**
 * Base fields shared by every sprite sheet entry, whatever kind of content it
 * holds.
 * Entries are searched by `type` rather than relied on to
 * sit at any particular index.
 *
 * A single sheet is always entirely one kind of entry - a plain
 * {@link SpriteTileDescriptor} for static content with no animation (e.g. a
 * tree, a patch of gravel), a {@link SpriteRowDescriptor} for an entity's
 * animation (e.g. a walk cycle), or a {@link SpriteAnimatedTileDescriptor}
 * for a looping environmental animation with no owning entity (e.g.
 * shimmering water) - never a mix of these, so {@link SpriteSheetDescriptor}
 * takes the concrete entry shape as a type parameter rather than trying to
 * describe all three at once.
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
    /** This entry's cell width in pixels, if it differs from the sheet's default {@link SpriteSheetDescriptor.cellWidth}. */
    width?: number;
    /** This entry's cell height in pixels, if it differs from {@link SpriteSheetDescriptor.cellHeight}. */
    height?: number;
    /** Collision bounding shape relative to the cell's centre. Absent for a non-interactable entry. */
    bounds?: SpriteBounds;
    /** How this entry reacts to an overlapping entity, if {@link bounds} is set. Defaults to `"solid"` when absent. */
    response?: CollisionResponseKind;
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
     * Pixel x of a static "idle" frame for this row - shown when not
     * animating but has the same `type` - if it has one.
     */
    idleX?: number;
}

/**
 * A {@link SpriteTileDescriptor} that plays back as a looping multi-phase
 * animation with no collision shape of its own (e.g. shimmering water).
 * Unlike {@link SpriteRowDescriptor} - which is always an *entity's*
 * animation and so always carries collision bounds - this inherits
 * {@link SpriteTileDescriptor.bounds} as still-optional, and drives its own
 * playback speed via {@link frameIntervalMs} rather than being stepped by an
 * owning entity.
 *
 * @typeParam TType - Union of valid `type` values for this sheet's entries.
 */
export interface SpriteAnimatedTileDescriptor<TType extends string = string> extends SpriteTileDescriptor<TType> {
    /** Number of animation phases (columns starting at `x`), always looping. */
    phases: number;
    /** How long, in milliseconds, each phase is shown before advancing to the next. */
    frameIntervalMs: number;
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
