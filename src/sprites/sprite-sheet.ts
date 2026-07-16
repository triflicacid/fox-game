import {SpriteFrame, SpriteRect} from "./sprite";

/**
 * Base class for a single image file containing multiple named/indexed
 * sprites (a "sprite sheet"), with subclasses supplying the sheet-specific
 * lookup used to find each sprite's region within the image.
 *
 * @typeParam TArgs - Tuple of argument types accepted by {@link locateSprite}
 * for this sheet (e.g. `[direction: FoxDirection, phase: number]`).
 */
export abstract class SpriteSheet<TArgs extends unknown[] = unknown[]> {
    /** Cached, lazily-created promise for the loaded sheet image. */
    private imagePromise?: Promise<HTMLImageElement>;

    /**
     * @param src - URL/path of the sprite sheet image, e.g. `"./static/foo.png"`.
     */
    protected constructor(protected readonly src: string) {
    }

    /**
     * Locates a sprite within this sheet, returning the pixel rectangle it
     * occupies plus its position within its animation. Subclasses define
     * what arguments identify a sprite (e.g. a direction and animation
     * phase) and how many frames that animation has.
     *
     * @param args - Sheet-specific arguments identifying which sprite to locate.
     * @returns The located frame.
     */
    public abstract locateSprite(...args: TArgs): SpriteFrame;

    /**
     * Every valid value for this sheet's primary "type" argument (the first
     * argument to {@link locateSprite}): e.g. every row key. Lets callers
     * enumerate or pick a type at random without needing to know or
     * duplicate the sheet's internal domain.
     *
     * @returns Every valid `type` value for this sheet.
     */
    public abstract getSpriteTypes(): TArgs[0][];

    /**
     * Steps forward to the next frame of `frame`'s animation, wrapping back
     * to the first frame after the last. Callers don't need to know how many
     * frames the animation has: that travels with `frame` itself.
     *
     * @param frame - A frame previously returned by {@link locateSprite}, {@link next}, or {@link previous}.
     * @returns The following frame in the same animation.
     */
    public next(frame: SpriteFrame): SpriteFrame {
        return this.step(frame, 1);
    }

    /**
     * Steps backward to the previous frame of `frame`'s animation, wrapping
     * to the last frame before the first.
     *
     * @param frame - A frame previously returned by {@link locateSprite}, {@link next}, or {@link previous}.
     * @returns The preceding frame in the same animation.
     */
    public previous(frame: SpriteFrame): SpriteFrame {
        return this.step(frame, -1);
    }

    /**
     * Shared stepping logic for {@link next}/{@link previous}: moves `delta`
     * frames along, wrapping via `frameCount`, and shifts `x` by the same
     * number of cell-widths - this works for any sheet layout without
     * needing to know the row's starting `x`, since the current `x` already
     * encodes it.
     *
     * @param frame - The frame to step from.
     * @param delta - Number of frames to move (e.g. `1` or `-1`).
     * @returns The resulting frame.
     */
    private step(frame: SpriteFrame, delta: number): SpriteFrame {
        const frameIndex = (frame.frameIndex + delta + frame.frameCount) % frame.frameCount;
        return {
            ...frame,
            x: frame.x + (frameIndex - frame.frameIndex) * frame.w,
            frameIndex,
        };
    }

    /**
     * Crops the given region out of this sheet's image and returns it as a
     * standalone bitmap, loading the sheet image first if necessary.
     *
     * @param rect - Region to extract, typically obtained from {@link locateSprite}.
     * @returns A bitmap containing just the requested region.
     */
    public async extractSprite(rect: SpriteRect): Promise<ImageBitmap> {
        const image = await this.loadImage();
        return createImageBitmap(image, rect.x, rect.y, rect.w, rect.h);
    }

    /**
     * Loads (or returns the already-loading/loaded) sheet image, so the
     * network/decode cost is only ever paid once per sheet instance.
     *
     * @returns The loaded sheet image.
     */
    private loadImage(): Promise<HTMLImageElement> {
        if (!this.imagePromise) {
            this.imagePromise = new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error(`Failed to load sprite sheet: ${this.src}`));
                image.src = this.src;
            });
        }
        return this.imagePromise;
    }
}
