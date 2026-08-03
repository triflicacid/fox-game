import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";

/**
 * Every sprite sheet a chunk/tiles needs to generate/render its
 * content.
 */
export interface ChunkSpriteSheets {
    /** Ground tiles - grass/dirt/gravel/water. */
    backgroundTile: BackgroundTileSpriteSheet;

    /**
     * Resolves a decorative structure piece's sprite type to its bitmap,
     * whichever concrete sheet it actually lives on.
     *
     * @param sprite - The structure piece's sprite type.
     * @returns The resolved bitmap.
     */
    getStructureSpriteBitmap(sprite: string): Promise<ImageBitmap>;
}
