import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import type {Feature} from "./features/feature";

/**
 * Every piece of generated data a {@link Tile} needs. Biome lives on
 * {@link Chunk} instead (one biome per chunk, not per tile) - see
 * `plans/terrain-generation.md`.
 */
export interface TileData {
    /**
     * The feature (a lake, a river, ...) this tile is part of, or `null` for
     * none. Kept as a reference to the actual {@link Feature} instance
     * rather than re-derived from `groundType` later, since `groundType`
     * alone can't tell a river tile from a lake tile once both happen to
     * render as `waterLight`.
     */
    feature: Feature | null;
    /**
     * Which sprite this tile renders - a grass variant for dry land, or a
     * water sprite (`waterLight`/`waterDark`) when `feature` is set. Water is
     * just another ground sprite, not a separate layer drawn on top - a tile
     * is never "grass with water over it", it's simply water - so there's
     * exactly one type/bitmap to track, not two.
     */
    groundType: BackgroundTileType;
}

/**
 * A single square tile within a {@link Chunk}. Renders whichever bitmap
 * {@link groundType} resolves to in the shared background-tile sheet.
 */
export class Tile {
    private bitmap: ImageBitmap | null = null;

    public readonly feature: Feature | null;
    public readonly groundType: BackgroundTileType;

    /**
     * @param data - This tile's generated data - see {@link TileData}.
     * @param spriteSheets - Shared sprite sheets to resolve bitmaps from.
     */
    public constructor(data: TileData, spriteSheets: ChunkSpriteSheets) {
        this.feature = data.feature;
        this.groundType = data.groundType;

        void spriteSheets.backgroundTile.getTileBitmap(data.groundType).then((bitmap) => {
            this.bitmap = bitmap;
        });
    }

    /**
     * Draws this tile's bitmap. Draws nothing on the handful of frames
     * before it's finished loading.
     *
     * @param ctx - Canvas context to draw into.
     * @param x - Left edge of the tile, in canvas pixels.
     * @param y - Top edge of the tile, in canvas pixels.
     * @param size - Width/height of the tile, in canvas pixels.
     */
    public draw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        if (!this.bitmap) {
            return;
        }
        ctx.drawImage(this.bitmap, x, y, size, size);
    }
}
