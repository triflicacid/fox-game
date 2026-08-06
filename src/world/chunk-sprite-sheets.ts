import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";
import {AnimatedBackgroundTileSpriteSheet} from "../sprites/AnimatedBackgroundTileSpriteSheet";

/**
 * Every sprite sheet a chunk/tiles needs to generate/render its
 * content.
 */
export interface ChunkSpriteSheets {
    /** Static ground tiles - grass/dirt/gravel/sand. */
    backgroundTile: BackgroundTileSpriteSheet;

    /** Animated water tiles - lake/oasis, light/dark. */
    waterTile: AnimatedBackgroundTileSpriteSheet;

    /**
     * Resolves a decorative structure piece's sprite type to its bitmap,
     * whichever concrete sheet it actually lives on.
     *
     * @param sprite - The structure piece's sprite type.
     * @returns The resolved bitmap.
     */
    getStructureSpriteBitmap(sprite: string): Promise<ImageBitmap>;
}
