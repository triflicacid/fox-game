import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";
import {AnimatedBackgroundTileSpriteSheet} from "../sprites/AnimatedBackgroundTileSpriteSheet";
import {ConvexPolygon} from "../geometry/convex-polygon";

/**
 * Every sprite sheet a chunk/tiles needs to generate/render its
 * content.
 */
export interface ChunkSpriteSheets {
    /** Static ground tiles - grass/dirt/gravel/sand. */
    backgroundTile: BackgroundTileSpriteSheet;

    /** Animated ground tiles. */
    animatedBackgroundTile: AnimatedBackgroundTileSpriteSheet;

    /**
     * Resolves a decorative structure piece's sprite type to its bitmap,
     * whichever concrete sheet it actually lives on.
     *
     * @param sprite - The structure piece's sprite type.
     * @returns The resolved bitmap.
     */
    getStructureSpriteBitmap(sprite: string): Promise<ImageBitmap>;

    /**
     * `sprite`'s own authored collision hull (see `SpriteBounds`), scaled to
     * `tileSize` and centred at `(centerX, centerY)`.
     *
     * @param sprite - The structure piece's sprite type.
     * @param centerX - Tile centre X to place the polygon at, in canvas pixels.
     * @param centerY - Tile centre Y to place the polygon at, in canvas pixels.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     * @returns The sprite's collision polygon, or `undefined` if it has no authored hull (e.g. a live tree's edge-to-edge "square" log variant).
     */
    getStructureCollisionPolygon(sprite: string, centerX: number, centerY: number, tileSize: number): ConvexPolygon | undefined;
}
