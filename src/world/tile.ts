import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {FeatureTag} from "./generation/feature-tag";

/** A drawing target a {@link Tile} can render itself into. */
export type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Colours of the "not ready" placeholder's 2x2 checkerboard. */
const NOT_READY_COLORS: readonly string[] = ["#000000", "#ff00ff", "#ff00ff", "#000000"];

/** Draws the classic black/magenta "missing texture" checkerboard, for a tile whose sprite hasn't loaded yet. */
function drawNotReadyTile(ctx: DrawContext, x: number, y: number, size: number): void {
    const half = size / 2;
    NOT_READY_COLORS.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(x + (i % 2) * half, y + Math.floor(i / 2) * half, half, half);
    });
}

/**
 * Every piece of generated data a {@link Tile} needs.
 */
export interface TileData {
    /** Which feature (if any) this tile belongs to. */
    featureTag: FeatureTag;
    /** Which sprite this tile renders. */
    groundType: BackgroundTileType;
}

/**
 * A single square tile within a {@link Chunk}. Renders whichever bitmap
 * {@link groundType} resolves to in the shared background-tile sheet.
 */
export class Tile {
    private bitmap: ImageBitmap | null = null;
    private readonly bitmapReady: Promise<void>;

    public readonly featureTag: FeatureTag;
    public readonly groundType: BackgroundTileType;

    /**
     * @param data - This tile's generated data - see {@link TileData}.
     * @param spriteSheets - Shared sprite sheets to resolve bitmaps from.
     */
    public constructor(data: TileData, spriteSheets: ChunkSpriteSheets) {
        this.featureTag = data.featureTag;
        this.groundType = data.groundType;

        this.bitmapReady = spriteSheets.backgroundTile.getTileBitmap(data.groundType).then((bitmap) => {
            this.bitmap = bitmap;
        });
    }

    /**
     * Resolves once this tile's sprite bitmap has finished loading, for
     * {@link Chunk}'s bitmap cache to wait on before drawing itself.
     *
     * @returns A promise that resolves once {@link draw} has something to paint.
     */
    public whenReady(): Promise<void> {
        return this.bitmapReady;
    }

    /**
     * Draws this tile's bitmap, or a checkerboard "not ready" placeholder on
     * the handful of frames before it's finished loading.
     *
     * @param ctx - Canvas context to draw into.
     * @param x - Left edge of the tile, in canvas pixels.
     * @param y - Top edge of the tile, in canvas pixels.
     * @param size - Width/height of the tile, in canvas pixels.
     */
    public draw(ctx: DrawContext, x: number, y: number, size: number): void {
        if (!this.bitmap) {
            drawNotReadyTile(ctx, x, y, size);
            return;
        }
        ctx.drawImage(this.bitmap, x, y, size, size);
    }
}
