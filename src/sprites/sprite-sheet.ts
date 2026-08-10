import {SpriteRect} from "./sprite";

/**
 * Shared base for loading a sprite sheet's image and cropping regions out of
 * it. Subclasses ({@link AnimatedSpriteSheet}, {@link StaticSpriteSheet}) add
 * the actual layout/lookup behaviour.
 */
export abstract class SpriteSheet {
    /** Cached, lazily-created promise for the loaded sheet image. */
    private imagePromise?: Promise<HTMLImageElement>;

    /**
     * @param src - URL/path of the sprite sheet image, e.g. `"./static/foo.png"`.
     */
    protected constructor(private readonly src: string) {
    }

    /**
     * Crops the given region out of this sheet's image and returns it as a
     * standalone bitmap, loading the sheet image first if necessary.
     *
     * @param rect - Region to extract, typically obtained from {@link AnimatedSpriteSheet.locateSprite} or {@link StaticSpriteSheet.locateTile}.
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
