import {Camera} from "../../camera/camera";
import {DEBUG_CONFIG} from "../../debug/debug-config";
import type {DebugHudRenderer} from "../../debug/debug-hud";
import {EntityCollection} from "../../entities/entity-collection";
import {Vector2d} from "../../geometry/vector2d";
import {Minimap, type MinimapRenderer} from "../../minimap/minimap";
import type {MinimapStatsHudRenderer} from "../../minimap/minimap-stats-hud";
import type {DrawableChunk} from "../chunks/chunk";
import {CHUNK_SIZE} from "../chunks/chunk-size";
import type {ReadonlyChunkStore} from "../chunks/chunk-store";
import {visibleChunkRange} from "../chunks/chunk-streaming-math";
import type {WorldCollisionDebugState} from "../collision/world-collision-system";
import {pixelRectToTileRange, tileToChunk} from "../coordinates/world-grid-math";
import type {WorldEffects} from "../effects/world-effects";
import {getFieldGradient} from "../generation/noise-field-colors";
import type {WorldGenerationView} from "../generation/world-generation-view";
import type {MinimapDataBuilder} from "../inspection/minimap-data-builder";
import type {WorldDebugSnapshotBuilder} from "../inspection/world-debug-snapshot-builder";
import type {WorldHoverInspector} from "../inspection/world-hover-inspector";
import type {Tile} from "../tiles/tile";

/** Per-frame chunk-streaming and collision snapshot {@link WorldRenderer.draw} needs but does not own. */
export interface WorldFrameStats {
    /** Whether chunk generation is currently enabled. */
    readonly generationEnabled: boolean;
    /** How many chunks are currently loaded in memory. */
    readonly loadedChunkCount: number;
    /** How many currently loaded chunks are still generating. */
    readonly generatingChunkCount: number;
    /** Generation time of the most recently finished chunk, in ms. */
    readonly latestChunkGenerationTimeMs: number;
    /** Mean generation time across every chunk generated this session, in ms. */
    readonly averageChunkGenerationTimeMs: number;
    /** The most recently handled entity/obstacle collision, or `undefined`. */
    readonly collision: WorldCollisionDebugState | undefined;
}

/**
 * Renders one world frame: chunks, noise overlay, effects, entities,
 * foreground props, debug overlays, minimap, and HUDs.
 */
export class WorldRenderer {
    /** Fill colour for the "void" - camera-visible area outside every loaded chunk. */
    private static readonly VOID_COLOR = "#000000";

    /** Total elapsed time on the shared clock animated background tiles read their phase from. Advanced every {@link advanceAnimation}. */
    private animationElapsedMs = 0;

    /** Whether the minimap is currently shown. */
    private minimapEnabled = true;

    /** Chunk count the last {@link draw} call rendered. */
    private lastVisibleChunkCount = 0;

    /**
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     * @param chunkStore - Passive loaded-chunk lookup; never requests generation.
     * @param requestChunk - Requests a chunk, generating it if it isn't loaded yet - preserves `World.draw`'s existing draw-triggered generation.
     * @param entityCollection - Live entity set to draw and read the main entity from.
     * @param worldEffects - Active transient effects to draw.
     * @param minimapBuilder - Builds per-frame minimap and minimap-stats data.
     * @param hoverInspector - Receives each frame's minimap data for later hover queries.
     * @param debugSnapshotBuilder - Builds per-frame debug HUD data.
     * @param generationView - Noise-field access for the debug overlay.
     * @param getQueuePosition - A pending chunk's position in the generation queue, or `undefined`.
     * @param debugHud - Renders the debug HUD.
     * @param minimap - Renders the minimap.
     * @param minimapStatsHud - Renders the minimap statistics HUD.
     */
    public constructor(
        private readonly tileSize: number,
        private readonly chunkStore: ReadonlyChunkStore<DrawableChunk>,
        private readonly requestChunk: (chunkX: number, chunkY: number) => DrawableChunk,
        private readonly entityCollection: EntityCollection,
        private readonly worldEffects: WorldEffects,
        private readonly minimapBuilder: MinimapDataBuilder,
        private readonly hoverInspector: WorldHoverInspector,
        private readonly debugSnapshotBuilder: WorldDebugSnapshotBuilder,
        private readonly generationView: WorldGenerationView,
        private readonly getQueuePosition: (chunkX: number, chunkY: number) => number | undefined,
        private readonly debugHud: DebugHudRenderer,
        private readonly minimap: MinimapRenderer,
        private readonly minimapStatsHud: MinimapStatsHudRenderer,
    ) {}

    /** Advances the shared animation clock by one tick. */
    public advanceAnimation(deltaMs: number): void {
        this.animationElapsedMs += deltaMs;
    }

    /** The shared animation clock's total elapsed time, in ms. */
    public getAnimationElapsedMs(): number {
        return this.animationElapsedMs;
    }

    /** Whether the minimap is currently shown. */
    public isMinimapEnabled(): boolean {
        return this.minimapEnabled;
    }

    /** Shows or hides the minimap. */
    public setMinimapEnabled(enabled: boolean): void {
        this.minimapEnabled = enabled;
    }

    /** Renders the world: chunks, noise overlay, effects, entities, foreground props, debug, minimap, and HUDs. */
    public draw(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        debugEnabled: boolean,
        bordersEnabled: boolean,
        hitboxesEnabled: boolean,
        spectating: boolean,
        spectatorVelocity: Vector2d,
        actualFps: number,
        targetFps: number | undefined,
        noiseFieldName: string | undefined,
        stats: WorldFrameStats,
    ): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        ctx.save();
        ctx.scale(camera.getZoom(), camera.getZoom());
        ctx.imageSmoothingEnabled = false;

        this.lastVisibleChunkCount = 0;
        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;

                if (!stats.generationEnabled && !this.chunkStore.has(chunkX, chunkY)) {
                    ctx.fillStyle = WorldRenderer.VOID_COLOR;
                    ctx.fillRect(originX, originY, chunkPixelSize, chunkPixelSize);
                    continue;
                }

                const chunk = this.requestChunk(chunkX, chunkY);
                chunk.draw(ctx, originX, originY, this.tileSize, this.animationElapsedMs);
                this.lastVisibleChunkCount++;
            }
        }

        if (debugEnabled && noiseFieldName) {
            this.drawNoiseFieldOverlay(ctx, camera, noiseFieldName);
        }

        this.worldEffects.draw(ctx, viewX, viewY);
        this.entityCollection.draw(ctx, camera, hitboxesEnabled);
        this.drawStructureProps(ctx, camera);

        if (bordersEnabled) {
            // drawn last, on top of entities/structures alike, so debug
            // annotations are never occluded by a tree or entity
            this.drawChunkDebugOverlays(ctx, camera);
            this.drawBiomeOutlines(ctx, camera);
        }

        ctx.restore();

        let minimapData = undefined;
        if (this.minimapEnabled) {
            const center = spectating ? camera.getCenter() : this.entityCollection.getMainEntity().getPosition();
            minimapData = this.minimapBuilder.build(center, spectating, camera, debugEnabled, noiseFieldName);
            this.minimap.draw(ctx, ctx.canvas.width, minimapData);
        }
        this.hoverInspector.setLastMinimapData(minimapData);

        if (debugEnabled) {
            const debugData = this.debugSnapshotBuilder.build(
                camera,
                this.entityCollection.getMainEntity(),
                {spectating, spectatorVelocity, actualFps, targetFps},
                this.lastVisibleChunkCount,
                stats.loadedChunkCount,
                stats.generatingChunkCount,
                stats.latestChunkGenerationTimeMs,
                stats.averageChunkGenerationTimeMs,
                stats.collision,
            );
            this.debugHud.draw(ctx, debugData);
            if (noiseFieldName) {
                const legendRightEdge = this.minimapEnabled
                    ? Minimap.getLegendRightEdge(ctx.canvas.width)
                    : ctx.canvas.width - DEBUG_CONFIG.noiseLegendMargin;
                this.drawNoiseFieldLegend(ctx, legendRightEdge, noiseFieldName);
            }
            if (minimapData) {
                this.minimapStatsHud.draw(ctx, ctx.canvas.width, this.minimapBuilder.buildStats(minimapData));
            }
        }
    }

    /**
     * Draws every loaded visible chunk's foreground-layer structure pieces.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     */
    private drawStructureProps(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.chunkStore.has(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.requestChunk(chunkX, chunkY).drawProps(ctx, originX, originY, this.tileSize);
            }
        }
    }

    /**
     * Draws every loaded visible chunk's debug overlay.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera to render the world through.
     */
    private drawChunkDebugOverlays(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.chunkStore.has(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                const chunk = this.requestChunk(chunkX, chunkY);
                const queuePosition = chunk.isReady() ? undefined : this.getQueuePosition(chunkX, chunkY);
                chunk.drawDebug(ctx, originX, originY, this.tileSize, queuePosition);
            }
        }
    }

    /** Draws each visible edge whose neighbouring tiles have different biome tags. */
    private drawBiomeOutlines(ctx: CanvasRenderingContext2D, camera: Camera): void {
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const {startTileX, startTileY, endTileX, endTileY} = pixelRectToTileRange(viewX, viewY, camera.getWidth(), camera.getHeight(), this.tileSize);

        ctx.strokeStyle = DEBUG_CONFIG.biomeOutlineColor;
        ctx.lineWidth = DEBUG_CONFIG.biomeOutlineWidth;
        ctx.beginPath();
        let hasBoundary = false;

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.getReadyTile(tileX, tileY);
                if (!tile) {
                    continue;
                }

                const left = tileX * this.tileSize - viewX;
                const top = tileY * this.tileSize - viewY;
                const right = left + this.tileSize;
                const bottom = top + this.tileSize;
                const rightTile = this.getReadyTile(tileX + 1, tileY);
                if (rightTile && rightTile.biomeTag !== tile.biomeTag) {
                    ctx.moveTo(right, top);
                    ctx.lineTo(right, bottom);
                    hasBoundary = true;
                }

                const bottomTile = this.getReadyTile(tileX, tileY + 1);
                if (bottomTile && bottomTile.biomeTag !== tile.biomeTag) {
                    ctx.moveTo(left, bottom);
                    ctx.lineTo(right, bottom);
                    hasBoundary = true;
                }
            }
        }

        if (hasBoundary) {
            ctx.stroke();
        }
    }

    /**
     * Returns a tile only when its containing chunk is already loaded and
     * ready, without requesting generation.
     */
    private getReadyTile(tileX: number, tileY: number): Tile | undefined {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY);
        const chunk = this.chunkStore.get(chunkX, chunkY);
        if (!chunk?.isReady()) {
            return undefined;
        }
        return chunk.getTile(tileX - chunkX * CHUNK_SIZE, tileY - chunkY * CHUNK_SIZE);
    }

    /**
     * Renders one registered `NoiseField` as a heatmap, using its themed
     * colour gradient (see `noise-field-colors.ts`) if it has one, or
     * greyscale (black = 0, white = close to 1) otherwise.
     *
     * @param ctx - Canvas context to draw into.
     * @param camera - Camera whose view to cover.
     * @param fieldName - Name of the field to render; a no-op if nothing is registered under that name.
     */
    private drawNoiseFieldOverlay(ctx: CanvasRenderingContext2D, camera: Camera, fieldName: string): void {
        const field = this.generationView.getField(fieldName);
        if (!field) {
            return;
        }

        const gradient = getFieldGradient(fieldName);
        const viewX = camera.getViewX();
        const viewY = camera.getViewY();
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const {startChunkX, startChunkY, endChunkX, endChunkY} = visibleChunkRange(viewX, viewY, camera.getWidth(), camera.getHeight(), chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                if (!this.chunkStore.has(chunkX, chunkY)) {
                    continue;
                }
                const originX = chunkX * chunkPixelSize - viewX;
                const originY = chunkY * chunkPixelSize - viewY;
                this.requestChunk(chunkX, chunkY).drawNoiseOverlay(ctx, originX, originY, this.tileSize, field, gradient);
            }
        }
    }

    /**
     * Draws a vertical colour-scale key for the currently visualised noise
     * field, rangine from `1` at the top to `0` at the bottom, with tick labels
     * every 0.25.
     *
     * @param ctx - Canvas context to draw into, already outside any camera transform.
     * @param rightEdge - Where the legend's right edge should sit, in canvas pixels - immediately left of the
     * minimap when it's also showing this frame, or the canvas's own right margin otherwise (see {@link draw}).
     * @param fieldName - Name of the currently visualised field.
     */
    private drawNoiseFieldLegend(ctx: CanvasRenderingContext2D, rightEdge: number, fieldName: string): void {
        const {
            noiseLegendBarWidth: barWidth,
            noiseLegendBarHeight: barHeight,
            noiseLegendMargin: margin,
            noiseLegendPadding: padding,
            noiseLegendTickLength: tickLength,
            noiseLegendLabelGap: labelGap,
        } = DEBUG_CONFIG;
        const ticks: {value: number; label: string}[] = [
            {value: 1, label: "MAX (1)"},
            {value: 0.75, label: "0.75"},
            {value: 0.5, label: "0.5"},
            {value: 0.25, label: "0.25"},
            {value: 0, label: "MIN (0)"},
        ];

        ctx.font = DEBUG_CONFIG.noiseLegendFont;
        const labelWidth = Math.max(...ticks.map((tick) => ctx.measureText(tick.label).width));

        const boxWidth = padding * 2 + barWidth + tickLength + labelGap + labelWidth;
        const boxHeight = padding * 2 + barHeight;
        const boxLeft = rightEdge - boxWidth;
        const boxTop = margin;
        const barLeft = boxLeft + padding;
        const barTop = boxTop + padding;

        ctx.fillStyle = DEBUG_CONFIG.noiseLegendBackgroundColor;
        ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);

        const gradient = ctx.createLinearGradient(barLeft, barTop, barLeft, barTop + barHeight);
        for (const stop of getFieldGradient(fieldName)) {
            const [r, g, b] = stop.rgb;
            gradient.addColorStop(1 - stop.value, `rgb(${r}, ${g}, ${b})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(barLeft, barTop, barWidth, barHeight);

        ctx.strokeStyle = DEBUG_CONFIG.noiseLegendLineColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(barLeft + 0.5, barTop + 0.5, barWidth - 1, barHeight - 1);

        ctx.fillStyle = DEBUG_CONFIG.noiseLegendTextColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        for (const tick of ticks) {
            const y = barTop + (1 - tick.value) * barHeight;
            ctx.beginPath();
            ctx.moveTo(barLeft + barWidth, y);
            ctx.lineTo(barLeft + barWidth + tickLength, y);
            ctx.stroke();
            ctx.fillText(tick.label, barLeft + barWidth + tickLength + labelGap, y);
        }
    }
}
