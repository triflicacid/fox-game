import {BackgroundTileType} from "../sprites/BackgroundTileSpriteSheet";
import {SpriteTile} from "../sprites/sprite";
import {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import {BiomeTag} from "./generation/biome/biome";
import {FeatureTag} from "./generation/feature/feature-tag";
import {ConvexPolygon} from "../geometry/convex-polygon";
import {Vector2d} from "../geometry/vector2d";

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
    /** Which biome supplied this tile's base terrain. */
    readonly biomeTag: BiomeTag;
    /** Capped 8-connected distance from this tile's biome border; features may read this to soften transitions. */
    readonly biomeDepth: number;
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

    /** This tile's sheet placement/collision bounds - see {@link getCollisionPolygon}. */
    private readonly spriteTile: SpriteTile;

    public readonly biomeTag: BiomeTag;
    public readonly biomeDepth: number;
    public readonly featureTag: FeatureTag;
    public readonly groundType: BackgroundTileType;

    /**
     * @param data - This tile's generated data - see {@link TileData}.
     * @param spriteSheets - Shared sprite sheets to resolve bitmaps from.
     */
    public constructor(data: TileData, spriteSheets: ChunkSpriteSheets) {
        this.biomeTag = data.biomeTag;
        this.biomeDepth = data.biomeDepth;
        this.featureTag = data.featureTag;
        this.groundType = data.groundType;

        this.spriteTile = spriteSheets.backgroundTile.locateTile(data.groundType);
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
     * This tile's collision polygon, in world pixels, or `undefined` if
     * {@link groundType} has no collision shape (e.g. grass - not
     * collidable). Scales the sprite's authored bounds - relative to the
     * cell centre, in the sheet's own pixel space - up/down to `tileSize`,
     * since a tile's sheet cell size and its actually-rendered size can
     * differ (see {@link Chunk.draw}).
     *
     * @param worldX - This tile's X position, in tiles from the world origin.
     * @param worldY - This tile's Y position, in tiles from the world origin.
     * @param tileSize - Width/height this tile renders at, in world pixels.
     * @returns The tile's world-space collision polygon, or `undefined` if it isn't collidable.
     */
    public getCollisionPolygon(worldX: number, worldY: number, tileSize: number): ConvexPolygon | undefined {
        const {bounds, w} = this.spriteTile;
        if (!bounds) {
            return undefined;
        }
        const scale = tileSize / w;
        const centerX = worldX * tileSize + tileSize / 2;
        const centerY = worldY * tileSize + tileSize / 2;
        return bounds.points.map((point) => new Vector2d(centerX + point.x * scale, centerY + point.y * scale));
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
