import {SpriteRect} from "./sprite";
import {SpriteAnimatedTileDescriptor, SpriteSheetDescriptor, TileAnimationSync} from "./sprite-sheet-descriptor";
import {SpriteSheet} from "./SpriteSheet";

/** {@link SpriteAnimatedTileDescriptor.sync} when a descriptor entry doesn't specify one. */
const DEFAULT_SYNC: TileAnimationSync = "perTile";

/**
 * A sprite sheet of multiple named, looping environmental tile animations
 * (e.g. shimmering water) laid out per a {@link SpriteSheetDescriptor} of
 * {@link SpriteAnimatedTileDescriptor} entries.
 *
 * Distinct from {@link AnimatedSpriteSheet}: that one is stepped externally
 * by an owning entity's own frame timer and carries collision bounds: this
 * one has no owning entity to step it, so it carries its own
 * {@link SpriteAnimatedTileDescriptor.frameIntervalMs} instead, and no
 * collision bounds at all (background tiles like water aren't collidable).
 *
 * @typeParam TType - Union of valid tile `type` values for this sheet.
 */
export class AnimatedTileSpriteSheet<TType extends string = string> extends SpriteSheet {
    /** Per-type extracted phase-bitmap cache. */
    private readonly bitmapCache = new Map<TType, Promise<ImageBitmap[]>>();

    /**
     * @param src - URL/path of the sprite sheet image, e.g. `"./static/foo.png"`.
     * @param descriptor - This sheet's layout, e.g. imported from a generated JSON file.
     */
    public constructor(
        src: string,
        private readonly descriptor: SpriteSheetDescriptor<TType, SpriteAnimatedTileDescriptor<TType>>,
    ) {
        super(src);
    }

    /**
     * Finds the entry describing `type`.
     *
     * @param type - Tile identifier to find.
     * @returns The matching entry.
     * @throws {Error} If no entry has this `type`.
     */
    private findTile(type: TType): SpriteAnimatedTileDescriptor<TType> {
        const tile = this.descriptor.rows.find((candidate) => candidate.type === type);
        if (!tile) {
            throw new Error(`Unknown sprite type: ${type}`);
        }
        return tile;
    }

    /**
     * Whether `type` is one of this sheet's animated types.
     *
     * @param type - A ground type to test.
     * @returns `true` if `type` is one of this sheet's animated types.
     */
    public hasType(type: string): type is TType {
        return this.descriptor.rows.some((candidate) => candidate.type === type);
    }

    /**
     * How many animation phases `type` cycles through.
     *
     * @param type - Tile identifier to look up.
     * @returns The phase count.
     */
    public getPhaseCount(type: TType): number {
        return this.findTile(type).phases;
    }

    /**
     * How long, in milliseconds, `type` shows each phase before advancing -
     * authored per type in the sheet's own descriptor, so a caller never
     * needs to know or duplicate playback speed itself.
     *
     * @param type - Tile identifier to look up.
     * @returns The frame interval, in milliseconds.
     */
    public getFrameIntervalMs(type: TType): number {
        return this.findTile(type).frameIntervalMs;
    }

    /**
     * How `type`'s tiles stay in step with each other - authored per type in
     * the sheet's own descriptor, defaulting to `"perTile"` when absent.
     *
     * @param type - Tile identifier to look up.
     * @returns The sync mode.
     */
    public getSync(type: TType): TileAnimationSync {
        return this.findTile(type).sync ?? DEFAULT_SYNC;
    }

    /**
     * Locates a single phase's pixel rectangle within this sheet.
     *
     * @param type - Tile identifier to locate a phase in.
     * @param phase - 0-indexed phase within that tile's animation.
     * @returns The located rectangle.
     */
    private locatePhase(type: TType, phase: number): SpriteRect {
        const tile = this.findTile(type);
        const w = tile.width ?? this.descriptor.cellWidth;
        const h = tile.height ?? this.descriptor.cellHeight;
        return {x: tile.x + phase * w, y: tile.y, w, h};
    }

    /**
     * Every tile `type` this sheet defines.
     *
     * @returns Every valid `type` value for this sheet.
     */
    public getSpriteTypes(): TType[] {
        return this.descriptor.rows.map((tile) => tile.type);
    }

    /**
     * Extracts every phase's bitmap for `type`, in phase order, memoised per
     * type so repeated calls (one per animated tile of that type) share the
     * same extraction work.
     *
     * @param type - Tile identifier to get phase bitmaps for.
     * @returns The tile's phase bitmaps, in phase order.
     */
    public getPhaseBitmaps(type: TType): Promise<ImageBitmap[]> {
        let bitmaps = this.bitmapCache.get(type);
        if (!bitmaps) {
            const phaseCount = this.getPhaseCount(type);
            bitmaps = Promise.all(
                Array.from({length: phaseCount}, (_, phase) => this.extractSprite(this.locatePhase(type, phase))),
            );
            this.bitmapCache.set(type, bitmaps);
        }
        return bitmaps;
    }
}
