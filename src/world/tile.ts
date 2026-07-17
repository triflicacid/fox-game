import {DEBUG_CONFIG} from "../debug/debug-config";
import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";

/**
 * A single square tile within a {@link Chunk}. Renders whichever ground
 * bitmap {@link groundType} resolves to in the shared background-tile sheet.
 */
export class Tile {
    private bitmap: ImageBitmap | null = null;

    /**
     * @param groundType - Which ground sprite this tile renders.
     * @param spriteSheets - Shared sprite sheets to resolve `groundType`'s bitmap from.
     */
    public constructor(
        public readonly groundType: BackgroundTileType,
        spriteSheets: ChunkSpriteSheets,
    ) {
        void spriteSheets.backgroundTile.getTileBitmap(groundType).then((bitmap) => {
            this.bitmap = bitmap;
        });
    }

    /**
     * Draws this tile's ground bitmap. Draws nothing on the handful of
     * frames before the sheet's image has finished loading.
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

    /**
     * Draws this tile's outline, for debug rendering mode.
     *
     * @param ctx - Canvas context to draw into.
     * @param x - Left edge of the tile, in canvas pixels.
     * @param y - Top edge of the tile, in canvas pixels.
     * @param size - Width/height of the tile, in canvas pixels.
     */
    public drawDebugOutline(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        ctx.strokeStyle = DEBUG_CONFIG.tileOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.tileOutlineWidth;
        ctx.strokeRect(x, y, size, size);
    }
}
