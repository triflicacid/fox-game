import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";

/**
 * Every sprite sheet a chunk/tiles needs to generate/render its
 * content.
 */
export interface ChunkSpriteSheets {
    /** Ground tiles - grass/dirt/gravel/water. */
    backgroundTile: BackgroundTileSpriteSheet;
}
