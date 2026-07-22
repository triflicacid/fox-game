import {SpriteFrame} from "./sprite";
import {SpriteRowDescriptor, SpriteSheetDescriptor} from "./sprite-sheet-descriptor";
import {SpriteSheet} from "./SpriteSheet";

/**
 * A sprite sheet of multiple named, animated sprites.
 * For a sheet of static, non-animated content, use
 * {@link StaticSpriteSheet} instead.
 *
 * @typeParam TType - Union of valid row `type` values for this sheet.
 */
export class AnimatedSpriteSheet<TType extends string = string> extends SpriteSheet {
    /**
     * @param src - URL/path of the sprite sheet image, e.g. `"./static/foo.png"`.
     * @param descriptor - This sheet's layout, e.g. imported from a generated JSON file.
     */
    public constructor(
        src: string,
        private readonly descriptor: SpriteSheetDescriptor<TType>,
    ) {
        super(src);
    }

    /**
     * Finds the row describing `type`.
     *
     * @param type - Row identifier to find.
     * @returns The matching row.
     * @throws {Error} If no row has this `type`.
     */
    private findRow(type: TType): SpriteRowDescriptor<TType> {
        const row = this.descriptor.rows.find((candidate) => candidate.type === type);
        if (!row) {
            throw new Error(`Unknown sprite type: ${type}`);
        }
        return row;
    }

    /**
     * Locates a sprite within this sheet, returning the pixel rectangle it
     * occupies plus its position within its animation.
     *
     * @param type - Row identifier to locate a sprite in.
     * @param phase - 1-indexed animation frame within that row. Defaults to `1`.
     * @returns The located frame.
     * @throws {Error} If `type` isn't a known row, or `phase` is out of range.
     */
    public locateSprite(type: TType, phase = 1): SpriteFrame {
        const row = this.findRow(type);
        if (phase < 1 || phase > row.phases) {
            throw new Error(`Phase must be between 1 and ${row.phases}, got ${phase}`);
        }

        const {cellWidth: w, cellHeight: h} = this.descriptor;
        return {
            x: row.x + (phase - 1) * w,
            y: row.y,
            w,
            h,
            frameIndex: phase - 1,
            frameCount: row.phases,
            loops: row.loops,
            frameIntervalMs: row.frameIntervalMs,
            bounds: row.bounds,
        };
    }

    /**
     * Locates a row's static "idle" frame: e.g. a direction's standing pose,
     * shown when facing that way but not animating. Stepping the result with
     * {@link next}/{@link previous} is a no-op, since it carries a
     * `frameCount` of 1.
     *
     * @param type - Row identifier to locate the idle frame for.
     * @returns The located frame.
     * @throws {Error} If `type` isn't a known row, or has no idle frame.
     */
    public locateIdleSprite(type: TType): SpriteFrame {
        const row = this.findRow(type);
        if (row.idleX === undefined) {
            throw new Error(`Sprite type ${type} has no idle frame`);
        }

        const {cellWidth: w, cellHeight: h} = this.descriptor;
        return {
            x: row.idleX,
            y: row.y,
            w,
            h,
            frameIndex: 0,
            frameCount: 1,
            loops: false,
            frameIntervalMs: row.frameIntervalMs,
            bounds: row.bounds,
        };
    }

    /**
     * Every row `type` this sheet defines. Lets callers enumerate or pick a
     * type at random without needing to know or duplicate the descriptor's
     * contents.
     *
     * @returns Every valid `type` value for this sheet.
     */
    public getSpriteTypes(): TType[] {
        return this.descriptor.rows.map((row) => row.type);
    }

    /**
     * Steps forward to the next frame of `frame`'s animation: wrapping back
     * to the first frame after the last if the animation loops, or holding on
     * the last frame if it doesn't (see {@link SpriteFrame.loops}).
     *
     * @param frame - A frame previously returned by {@link locateSprite}, {@link next}, or {@link previous}.
     * @returns The following frame in the same animation.
     */
    public next(frame: SpriteFrame): SpriteFrame {
        return this.step(frame, 1);
    }

    /**
     * Steps backward to the previous frame of `frame`'s animation: wrapping
     * to the last frame before the first if the animation loops, or holding
     * on the first frame if it doesn't.
     *
     * @param frame - A frame previously returned by {@link locateSprite}, {@link next}, or {@link previous}.
     * @returns The preceding frame in the same animation.
     */
    public previous(frame: SpriteFrame): SpriteFrame {
        return this.step(frame, -1);
    }

    /**
     * Shared stepping logic for {@link next}/{@link previous}: moves `delta`
     * frames along - wrapping via `frameCount` if `frame.loops`, else clamping
     * to the first/last frame - and shifts `x` by the same number of
     * cell-widths. This works for any sheet layout without needing to know
     * the row's starting `x`, since the current `x` already encodes it.
     *
     * @param frame - The frame to step from.
     * @param delta - Number of frames to move (e.g. `1` or `-1`).
     * @returns The resulting frame.
     */
    private step(frame: SpriteFrame, delta: number): SpriteFrame {
        const rawIndex = frame.frameIndex + delta;
        const frameIndex = frame.loops
            ? (rawIndex + frame.frameCount) % frame.frameCount
            : Math.min(Math.max(rawIndex, 0), frame.frameCount - 1);
        return {
            ...frame,
            x: frame.x + (frameIndex - frame.frameIndex) * frame.w,
            frameIndex,
        };
    }
}
