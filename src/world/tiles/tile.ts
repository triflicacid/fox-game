import {BackgroundTileType} from "../../sprites/BackgroundTileSpriteSheet";
import {SpriteTile} from "../../sprites/sprite";
import {ChunkSpriteSheets} from "../rendering/chunk-sprite-sheets";
import {BiomeTag} from "../generation/biome/biome";
import {FeatureTag} from "../generation/feature/feature-tag";
import {ConvexPolygon} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import {CollisionResponseKind} from "../../geometry/collision-response";
import {computePhaseOffset, resolvePhase} from "../rendering/animated-background-tiles";
import {TileAnimationSync} from "../../sprites/sprite-sheet-descriptor";

/** An animated tile's playback info - see {@link Tile.getAnimationInfo}. */
export interface TileAnimationInfo {
    /** How this tile's type stays in step with others of the same type - see {@link TileAnimationSync}. */
    sync: TileAnimationSync;
    /** How long, in milliseconds, this tile shows each phase before advancing. */
    frameIntervalMs: number;
}

/** A tile's resolved collision shape/reaction - see {@link Tile.getCollision}. */
export interface TileCollision {
    /** The tile's world-space collision polygon. */
    readonly polygon: ConvexPolygon;
    /** How the tile reacts to an overlapping entity - never `"none"`, since that's just {@link Tile.getCollision} returning `undefined` instead. */
    readonly response: Exclude<CollisionResponseKind, "none">;
}

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
 * {@link groundType} resolves to - a single static bitmap from the
 * background-tile sheet for most ground types, or, for an animated type
 * (currently just water - see `AnimatedBackgroundTileSpriteSheet`), one of
 * several phase bitmaps from the animated-tile sheet, picked in {@link draw}
 * by the caller's elapsed animation time.
 */
export class Tile {
    /** Set once loaded, for a non-animated tile - see {@link isAnimated}. */
    private bitmap: ImageBitmap | null = null;
    /** Set once loaded, for an animated tile, in phase order - see {@link isAnimated}. */
    private phaseBitmaps: ImageBitmap[] | null = null;
    private readonly bitmapReady: Promise<void>;

    /** How long, in milliseconds, an animated tile shows each phase - `0` for a non-animated tile. */
    private readonly frameIntervalMs: number;
    /** How many phases an animated tile cycles through - `1` for a non-animated tile. */
    private readonly phaseCount: number;
    /**
     * This animated tile's own starting point within its phase cycle,
     * derived from its world position - see {@link computePhaseOffset} and
     * {@link draw}. `0` for a non-animated tile.
     */
    private readonly phaseOffset: number;
    /** How an animated tile's type stays in step with others of the same type - see {@link TileAnimationSync}. `"perTile"` (unused) for a non-animated tile. */
    private readonly sync: TileAnimationSync;

    /** This tile's sheet placement/collision bounds - see {@link getCollisionPolygon}. Animated tiles have none. */
    private readonly spriteTile: SpriteTile;

    public readonly biomeTag: BiomeTag;
    public readonly biomeDepth: number;
    public readonly featureTag: FeatureTag;
    public readonly groundType: BackgroundTileType;

    /**
     * Whether this tile animates through several phases rather than
     * rendering one static bitmap - see {@link Chunk.hydrate}, which skips
     * caching a chunk's tile bitmap while any of its tiles are animated,
     * redrawing every tile each frame instead.
     */
    public readonly isAnimated: boolean;

    /**
     * @param data - This tile's generated data - see {@link TileData}.
     * @param spriteSheets - Shared sprite sheets to resolve bitmaps from.
     * @param worldX - This tile's X position, in tiles from the world origin - only used to derive {@link phaseOffset} for an animated tile.
     * @param worldY - This tile's Y position, in tiles from the world origin - only used to derive {@link phaseOffset} for an animated tile.
     */
    public constructor(data: TileData, spriteSheets: ChunkSpriteSheets, worldX: number, worldY: number) {
        this.biomeTag = data.biomeTag;
        this.biomeDepth = data.biomeDepth;
        this.featureTag = data.featureTag;
        this.groundType = data.groundType;

        const {animatedBackgroundTile} = spriteSheets;

        if (animatedBackgroundTile.hasType(data.groundType)) {
            const animatedType = data.groundType;
            this.isAnimated = true;

            this.spriteTile = {x: 0, y: 0, w: 1, h: 1};
            this.frameIntervalMs = animatedBackgroundTile.getFrameIntervalMs(animatedType);
            this.phaseCount = animatedBackgroundTile.getPhaseCount(animatedType);
            this.sync = animatedBackgroundTile.getSync(animatedType);
            this.phaseOffset = computePhaseOffset(worldX, worldY, this.phaseCount, this.sync);
            this.bitmapReady = animatedBackgroundTile.getPhaseBitmaps(animatedType).then((bitmaps) => {
                this.phaseBitmaps = bitmaps;
            });
        } else {
            this.isAnimated = false;
            this.spriteTile = spriteSheets.backgroundTile.locateTile(data.groundType);
            this.frameIntervalMs = 0;
            this.phaseCount = 1;
            this.sync = "perTile";
            this.phaseOffset = 0;
            this.bitmapReady = spriteSheets.backgroundTile.getTileBitmap(data.groundType).then((bitmap) => {
                this.bitmap = bitmap;
            });
        }
    }

    /**
     * Resolves once this tile's sprite bitmap(s) have finished loading, for
     * {@link Chunk}'s bitmap cache to wait on before drawing itself.
     *
     * @returns A promise that resolves once {@link draw} has something to paint.
     */
    public whenReady(): Promise<void> {
        return this.bitmapReady;
    }

    /**
     * This tile's collision polygon and response, in world pixels, or
     * `undefined` if {@link groundType} has no collision shape (e.g. grass)
     * or its authored {@link SpriteTile.response} is explicitly `"none"`.
     * Scales the sprite's authored bounds - relative to the cell centre, in
     * the sheet's own pixel space - up/down to `tileSize`, since a tile's
     * sheet cell size and its actually-rendered size can differ (see
     * {@link Chunk.draw}).
     *
     * @param worldX - This tile's X position, in tiles from the world origin.
     * @param worldY - This tile's Y position, in tiles from the world origin.
     * @param tileSize - Width/height this tile renders at, in world pixels.
     * @returns The tile's world-space collision polygon plus response, or `undefined` if it isn't collidable.
     */
    public getCollision(worldX: number, worldY: number, tileSize: number): TileCollision | undefined {
        const {bounds, response = "solid", w} = this.spriteTile;
        if (!bounds || response === "none") {
            return undefined;
        }
        const scale = tileSize / w;
        const centerX = worldX * tileSize + tileSize / 2;
        const centerY = worldY * tileSize + tileSize / 2;
        const polygon = bounds.points.map((point) => new Vector2d(centerX + point.x * scale, centerY + point.y * scale));
        return {polygon, response};
    }

    /**
     * This tile's animation playback info, for debug display (see
     * `HoverTooltip`), or `undefined` if it isn't animated.
     *
     * @returns The animation info, or `undefined` if {@link isAnimated} is `false`.
     */
    public getAnimationInfo(): TileAnimationInfo | undefined {
        return this.isAnimated ? {sync: this.sync, frameIntervalMs: this.frameIntervalMs} : undefined;
    }

    /**
     * This animated tile's current phase, per `animationElapsedMs` - see
     * {@link resolvePhase}. Only meaningful while {@link isAnimated}.
     *
     * @param animationElapsedMs - Total elapsed time on {@link World}'s shared animation clock, in milliseconds.
     * @returns The current phase, 0-indexed.
     */
    private currentPhase(animationElapsedMs: number): number {
        return resolvePhase(animationElapsedMs, this.frameIntervalMs, this.phaseOffset, this.phaseCount);
    }

    /**
     * Draws this tile's bitmap, or a checkerboard "not ready" placeholder on
     * the handful of frames before it's finished loading. For an animated
     * tile, picks {@link currentPhase}'s bitmap; ignored for a non-animated tile.
     *
     * @param ctx - Canvas context to draw into.
     * @param x - Left edge of the tile, in canvas pixels.
     * @param y - Top edge of the tile, in canvas pixels.
     * @param size - Width/height of the tile, in canvas pixels.
     * @param animationElapsedMs - Total elapsed time on {@link World}'s shared animation clock, in milliseconds. Defaults to `0` for callers that never draw an animated tile.
     */
    public draw(ctx: DrawContext, x: number, y: number, size: number, animationElapsedMs = 0): void {
        if (this.isAnimated) {
            if (!this.phaseBitmaps) {
                drawNotReadyTile(ctx, x, y, size);
                return;
            }
            ctx.drawImage(this.phaseBitmaps[this.currentPhase(animationElapsedMs)], x, y, size, size);
            return;
        }

        if (!this.bitmap) {
            drawNotReadyTile(ctx, x, y, size);
            return;
        }
        ctx.drawImage(this.bitmap, x, y, size, size);
    }

    /**
     * This tile's ground type for debug display, e.g. in the hover tooltip -
     * see `HoverTooltip`. For an animated tile, appends the 1-indexed frame
     * number currently showing (e.g. `"water.dark.2"`) so the tooltip reflects
     * what's actually on screen; for a non-animated tile, just {@link groundType}.
     *
     * @param animationElapsedMs - Total elapsed time on {@link World}'s shared animation clock, in milliseconds.
     * @returns The display ground type.
     */
    public getDisplayGroundType(animationElapsedMs: number): string {
        if (!this.isAnimated) {
            return this.groundType;
        }
        return `${this.groundType}.${this.currentPhase(animationElapsedMs) + 1}`;
    }
}
