import {Vector2d} from "../geometry/vector2d";
import {requireNonNull} from "../util";
import {MINIMAP_CONFIG} from "./minimap-config";

/** What the centre marker represents (main entity or spectator.) */
export type MinimapMarker =
    | {readonly kind: "entity"; readonly facing: Vector2d}
    | {readonly kind: "spectator"};

/**
 * Everything {@link Minimap.draw} needs for one frame - gathered by `World`,
 * which decides what `sampleColor` currently colours by (biome, or a
 * selected debug noise field - see `World.buildMinimapData`), so `Minimap`
 * itself stays a dumb renderer with no knowledge of biomes/noise fields, the
 * same `data`/`draw` split `DebugHud` already uses.
 */
export interface MinimapData {
    /** World tile position (fractional) to centre the minimap on. */
    centerTile: Vector2d;
    /** What the centre marker represents this frame - see {@link MinimapMarker}. */
    marker: MinimapMarker;
    /** How many world tiles one minimap pixel represents this frame (at 1x zoom) */
    worldTilesPerPixel: number;
    /** Identifies what `sampleColor` currently colours by (e.g. `"biome"` or `"noise:temperature"`). */
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
    private centerTile = Vector2d.ZERO;
    /** `data.modeKey` {@link bitmap} was last built for - `undefined` before the first build. */
    private modeKey: string | undefined;
    /** `data.worldTilesPerPixel` {@link bitmap} was last built for - meaningless until {@link hasBitmap} is `true`. */
    private worldTilesPerPixel = MINIMAP_CONFIG.worldTilesPerPixel;
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

        this.drawCenterMarker(ctx, boxLeft + box / 2, boxTop + box / 2, data.marker);
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

    /** Draws the centre marker directly onto the main canvas. */
    private drawCenterMarker(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, marker: MinimapMarker): void {
        const color = marker.kind === "spectator" ? MINIMAP_CONFIG.spectatorMarkerColor : MINIMAP_CONFIG.playerMarkerColor;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, MINIMAP_CONFIG.playerMarkerRadiusPx, 0, Math.PI * 2);
        ctx.fill();

        if (marker.kind === "spectator") {
            return;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = MINIMAP_CONFIG.playerMarkerWedgeWidth;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + marker.facing.x * MINIMAP_CONFIG.playerMarkerWedgeLengthPx,
            centerY + marker.facing.y * MINIMAP_CONFIG.playerMarkerWedgeLengthPx,
        );
        ctx.stroke();
    }

    /**
     * Keeps {@link bitmap} representing the world around `data.centerTileX/Y`:
     * builds it fresh on the first call, on a mode change (see
     * {@link MinimapData.modeKey}), a scale change (see
     * {@link MinimapData.worldTilesPerPixel} - e.g. the camera zoomed), or on
     * a jump wider than the box itself (e.g. a teleport); otherwise
     * self-blits the still-valid part and
     * resamples only the newly-exposed edge strip(s), in whole
     * `MINIMAP_CONFIG.sampleBlockPx` steps so no partial block is ever split
     * across the blit boundary. A no-op if the player hasn't crossed a whole
     * sample block's worth of world distance yet.
     */
    private updateBitmap(data: MinimapData): void {
        const box = MINIMAP_CONFIG.boxSizePx;

        if (!this.hasBitmap || this.modeKey !== data.modeKey || this.worldTilesPerPixel !== data.worldTilesPerPixel) {
            this.rebuild(data);
            return;
        }

        const shiftPx = this.computeBlockShift(data);
        if (shiftPx.x === 0 && shiftPx.y === 0) {
            return;
        }
        if (Math.abs(shiftPx.x) >= box || Math.abs(shiftPx.y) >= box) {
            this.rebuild(data);
            return;
        }

        this.centerTile = this.centerTile.add(shiftPx.scale(this.worldTilesPerPixel));
        this.bitmapCtx.drawImage(this.bitmap, -shiftPx.x, -shiftPx.y);
        this.patchEdges(shiftPx, data);
    }

    /** How far, in whole `MINIMAP_CONFIG.sampleBlockPx` steps (minimap pixels), the centre has moved since {@link centerTile} was last updated. */
    private computeBlockShift(data: MinimapData): Vector2d {
        const {sampleBlockPx} = MINIMAP_CONFIG;
        const deltaPx = data.centerTile.subtract(this.centerTile).scale(1 / this.worldTilesPerPixel);
        return new Vector2d(
            Math.trunc(deltaPx.x / sampleBlockPx) * sampleBlockPx,
            Math.trunc(deltaPx.y / sampleBlockPx) * sampleBlockPx,
        );
    }

    /** Discards {@link bitmap}'s content and resamples the whole box, centred on `data`'s current centre position. */
    private rebuild(data: MinimapData): void {
        this.centerTile = data.centerTile;
        this.modeKey = data.modeKey;
        this.worldTilesPerPixel = data.worldTilesPerPixel;
        this.hasBitmap = true;
        this.paintRegion(0, 0, MINIMAP_CONFIG.boxSizePx, MINIMAP_CONFIG.boxSizePx, data);
    }

    /** Resamples just the strip(s) exposed by a shift of `shiftPx` minimap pixels - at most one per axis. */
    private patchEdges(shiftPx: Vector2d, data: MinimapData): void {
        const box = MINIMAP_CONFIG.boxSizePx;
        if (shiftPx.x !== 0) {
            const stripX = shiftPx.x > 0 ? box - shiftPx.x : 0;
            this.paintRegion(stripX, 0, Math.abs(shiftPx.x), box, data);
        }
        if (shiftPx.y !== 0) {
            const stripY = shiftPx.y > 0 ? box - shiftPx.y : 0;
            this.paintRegion(0, stripY, box, Math.abs(shiftPx.y), data);
        }
    }

    /** Fills every `MINIMAP_CONFIG.sampleBlockPx`-aligned block inside the given pixel rectangle, one `data.sampleColor` call per block. */
    private paintRegion(x: number, y: number, w: number, h: number, data: MinimapData): void {
        const size = MINIMAP_CONFIG.sampleBlockPx;
        for (let py = y; py < y + h; py += size) {
            for (let px = x; px < x + w; px += size) {
                const tile = this.blockCenterTile(px, py);
                const [r, g, b] = data.sampleColor(tile.x, tile.y);
                this.bitmapCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                this.bitmapCtx.fillRect(px, py, size, size);
            }
        }
    }

    /** The world tile position (fractional) at the centre of the sample block whose top-left minimap-pixel corner is `(blockPx, blockPy)`. */
    private blockCenterTile(blockPx: number, blockPy: number): Vector2d {
        const {boxSizePx, sampleBlockPx} = MINIMAP_CONFIG;
        const offsetPx = new Vector2d(
            blockPx + sampleBlockPx / 2 - boxSizePx / 2,
            blockPy + sampleBlockPx / 2 - boxSizePx / 2,
        );
        return this.centerTile.add(offsetPx.scale(this.worldTilesPerPixel));
    }
}
