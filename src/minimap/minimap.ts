import {Vector2d} from "../geometry/vector2d";
import {requireNonNull} from "../util";
import {MINIMAP_CONFIG} from "./minimap-config";

/**
 * Everything {@link Minimap.draw} needs for one frame - gathered by `World`,
 * which decides what `sampleColor` currently colours by (biome, or a
 * selected debug noise field - see `World.buildMinimapData`), so `Minimap`
 * itself stays a dumb renderer with no knowledge of biomes/noise fields, the
 * same `data`/`draw` split `DebugHud` already uses.
 */
export interface MinimapData {
    /** World tile position (fractional) to centre the minimap on - the player's current position. */
    playerTileX: number;
    playerTileY: number;
    /** Player's facing direction, as a unit vector - drawn as the centre marker's wedge. */
    facing: Vector2d;
    /**
     * Identifies what `sampleColor` currently colours by (e.g. `"biome"` or
     * `"noise:temperature"`). A change from the previously drawn frame forces
     * a full bitmap resample instead of a shift/patch, since a shift would
     * blend two different colour languages into one bitmap.
     */
    modeKey: string;
    /** Resolves one sample block's fill colour, given its centre world tile position (fractional). */
    sampleColor(tileX: number, tileY: number): readonly [number, number, number];
}

/**
 * The always-on biome-overview minimap, flush against the canvas's
 * top-right corner. Renders into a small offscreen bitmap that's shifted and
 * edge-patched as the player moves rather than fully resampled every frame
 * (see {@link updateBitmap}), so its cost is bounded by its own fixed pixel
 * size - never by the camera's zoom or how many chunks are loaded.
 */
export class Minimap {
    private bitmap: OffscreenCanvas;
    private bitmapCtx: OffscreenCanvasRenderingContext2D;

    /** World tile position (fractional) {@link bitmap}'s centre currently represents. Meaningless until {@link hasBitmap} is `true`. */
    private centerTileX = 0;
    private centerTileY = 0;
    /** `data.modeKey` {@link bitmap} was last built for - `undefined` before the first build. */
    private modeKey: string | undefined;
    private hasBitmap = false;

    public constructor() {
        this.bitmap = new OffscreenCanvas(MINIMAP_CONFIG.boxSizePx, MINIMAP_CONFIG.boxSizePx);
        this.bitmapCtx = requireNonNull(this.bitmap.getContext("2d"));
    }

    /**
     * The minimap box's left edge, right-aligned with a fixed margin from
     * the canvas's right edge - a constant offset from the corner, since
     * *whether* the minimap shows is the only thing that varies, never
     * *where* it sits (see `World.draw`).
     *
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @returns The box's left edge, in canvas pixels.
     */
    public static getBoxLeft(canvasWidth: number): number {
        return canvasWidth - MINIMAP_CONFIG.margin - MINIMAP_CONFIG.boxSizePx;
    }

    /**
     * Right edge the noise-field legend should anchor to while the minimap
     * is also showing this frame - immediately left of the minimap box, with
     * a small gap, so the two widgets never overlap.
     *
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @returns The legend's right edge, in canvas pixels.
     */
    public static getLegendRightEdge(canvasWidth: number): number {
        return Minimap.getBoxLeft(canvasWidth) - MINIMAP_CONFIG.legendGap;
    }

    /**
     * Draws the minimap: its cached colour-fill bitmap (rebuilt/shifted as
     * needed - see {@link updateBitmap}), border, and player marker.
     *
     * @param ctx - Canvas context to draw into, already outside any camera transform.
     * @param canvasWidth - Canvas width, in canvas pixels, for right-alignment.
     * @param data - This frame's minimap data - see {@link MinimapData}.
     */
    public draw(ctx: CanvasRenderingContext2D, canvasWidth: number, data: MinimapData): void {
        this.ensureBitmapSize();
        this.updateBitmap(data);

        const box = MINIMAP_CONFIG.boxSizePx;
        const boxLeft = Minimap.getBoxLeft(canvasWidth);
        const boxTop = MINIMAP_CONFIG.margin;

        ctx.drawImage(this.bitmap, boxLeft, boxTop);

        ctx.strokeStyle = MINIMAP_CONFIG.borderColor;
        ctx.lineWidth = MINIMAP_CONFIG.borderWidth;
        ctx.strokeRect(boxLeft + 0.5, boxTop + 0.5, box - 1, box - 1);

        this.drawPlayerMarker(ctx, boxLeft + box / 2, boxTop + box / 2, data.facing);
    }

    /**
     * Resizes {@link bitmap} to match {@link MINIMAP_CONFIG}'s currently
     * configured box size, if it's drifted - e.g. from a live-tuning edit
     * via the field registry. Forces a full rebuild afterward, since a
     * resized canvas invalidates every previously sampled pixel.
     */
    private ensureBitmapSize(): void {
        const box = MINIMAP_CONFIG.boxSizePx;
        if (this.bitmap.width === box && this.bitmap.height === box) {
            return;
        }
        this.bitmap.width = box;
        this.bitmap.height = box;
        this.hasBitmap = false;
    }

    /** Draws the centre dot + facing wedge directly onto the main canvas, on top of the bitmap/border. */
    private drawPlayerMarker(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, facing: Vector2d): void {
        ctx.fillStyle = MINIMAP_CONFIG.playerMarkerColor;
        ctx.beginPath();
        ctx.arc(centerX, centerY, MINIMAP_CONFIG.playerMarkerRadiusPx, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = MINIMAP_CONFIG.playerMarkerColor;
        ctx.lineWidth = MINIMAP_CONFIG.playerMarkerWedgeWidth;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + facing.x * MINIMAP_CONFIG.playerMarkerWedgeLengthPx,
            centerY + facing.y * MINIMAP_CONFIG.playerMarkerWedgeLengthPx,
        );
        ctx.stroke();
    }

    /**
     * Keeps {@link bitmap} representing the world around `data.playerTileX/Y`:
     * builds it fresh on the first call, on a mode change (see
     * {@link MinimapData.modeKey}), or on a jump wider than the box itself
     * (e.g. a teleport); otherwise self-blits the still-valid part and
     * resamples only the newly-exposed edge strip(s), in whole
     * `MINIMAP_CONFIG.sampleBlockPx` steps so no partial block is ever split
     * across the blit boundary. A no-op if the player hasn't crossed a whole
     * sample block's worth of world distance yet.
     */
    private updateBitmap(data: MinimapData): void {
        const box = MINIMAP_CONFIG.boxSizePx;

        if (!this.hasBitmap || this.modeKey !== data.modeKey) {
            this.rebuild(data);
            return;
        }

        const {shiftPxX, shiftPxY} = this.computeBlockShift(data);
        if (shiftPxX === 0 && shiftPxY === 0) {
            return;
        }
        if (Math.abs(shiftPxX) >= box || Math.abs(shiftPxY) >= box) {
            this.rebuild(data);
            return;
        }

        this.centerTileX += shiftPxX * MINIMAP_CONFIG.worldTilesPerPixel;
        this.centerTileY += shiftPxY * MINIMAP_CONFIG.worldTilesPerPixel;
        // Self-blit: well-defined per the canvas spec (the source is
        // effectively snapshotted before the destination is overwritten) -
        // the standard technique behind any scrolling/infinite map view.
        this.bitmapCtx.drawImage(this.bitmap, -shiftPxX, -shiftPxY);
        this.patchEdges(shiftPxX, shiftPxY, data);
    }

    /** How far, in whole `MINIMAP_CONFIG.sampleBlockPx` steps (minimap pixels), the player has moved since {@link centerTileX}/{@link centerTileY} was last updated. */
    private computeBlockShift(data: MinimapData): {shiftPxX: number; shiftPxY: number} {
        const {worldTilesPerPixel, sampleBlockPx} = MINIMAP_CONFIG;
        const deltaPxX = (data.playerTileX - this.centerTileX) / worldTilesPerPixel;
        const deltaPxY = (data.playerTileY - this.centerTileY) / worldTilesPerPixel;
        return {
            shiftPxX: Math.trunc(deltaPxX / sampleBlockPx) * sampleBlockPx,
            shiftPxY: Math.trunc(deltaPxY / sampleBlockPx) * sampleBlockPx,
        };
    }

    /** Discards {@link bitmap}'s content and resamples the whole box, centred on `data`'s current player position. */
    private rebuild(data: MinimapData): void {
        this.centerTileX = data.playerTileX;
        this.centerTileY = data.playerTileY;
        this.modeKey = data.modeKey;
        this.hasBitmap = true;
        this.paintRegion(0, 0, MINIMAP_CONFIG.boxSizePx, MINIMAP_CONFIG.boxSizePx, data);
    }

    /** Resamples just the strip(s) exposed by a shift of `(shiftPxX, shiftPxY)` minimap pixels - at most one per axis. */
    private patchEdges(shiftPxX: number, shiftPxY: number, data: MinimapData): void {
        const box = MINIMAP_CONFIG.boxSizePx;
        if (shiftPxX !== 0) {
            const stripX = shiftPxX > 0 ? box - shiftPxX : 0;
            this.paintRegion(stripX, 0, Math.abs(shiftPxX), box, data);
        }
        if (shiftPxY !== 0) {
            const stripY = shiftPxY > 0 ? box - shiftPxY : 0;
            this.paintRegion(0, stripY, box, Math.abs(shiftPxY), data);
        }
    }

    /** Fills every `MINIMAP_CONFIG.sampleBlockPx`-aligned block inside the given pixel rectangle, one `data.sampleColor` call per block. */
    private paintRegion(x: number, y: number, w: number, h: number, data: MinimapData): void {
        const size = MINIMAP_CONFIG.sampleBlockPx;
        for (let py = y; py < y + h; py += size) {
            for (let px = x; px < x + w; px += size) {
                const [tileX, tileY] = this.blockCenterTile(px, py);
                const [r, g, b] = data.sampleColor(tileX, tileY);
                this.bitmapCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                this.bitmapCtx.fillRect(px, py, size, size);
            }
        }
    }

    /** The world tile position (fractional) at the centre of the sample block whose top-left minimap-pixel corner is `(blockPx, blockPy)`. */
    private blockCenterTile(blockPx: number, blockPy: number): [number, number] {
        const {boxSizePx, sampleBlockPx, worldTilesPerPixel} = MINIMAP_CONFIG;
        const offsetPxX = blockPx + sampleBlockPx / 2 - boxSizePx / 2;
        const offsetPxY = blockPy + sampleBlockPx / 2 - boxSizePx / 2;
        return [
            this.centerTileX + offsetPxX * worldTilesPerPixel,
            this.centerTileY + offsetPxY * worldTilesPerPixel,
        ];
    }
}
