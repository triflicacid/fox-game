import {Display} from "@display/display";
import {TextSegment} from "@display/text-style";
import {DEBUG_CONFIG} from "./debug-config";

/**
 * Everything the debug HUD needs to render one frame - gathered by whoever
 * owns the world/camera/entities, so {@link DebugHud} itself stays
 * decoupled from `World`.
 */

/** Readiness state of a single chunk, for the neighbour indicator. */
export type ChunkState = "ready" | "generating" | "unloaded";

export interface DebugHudData {
    cameraCenterX: number;
    cameraCenterY: number;
    viewportWidth: number;
    viewportHeight: number;
    entityX: number;
    entityY: number;
    entityFacing: string;
    tileX: number;
    tileY: number;
    chunkX: number;
    chunkY: number;
    chunkBiome: string;
    /** State of the four cardinal neighbours: north, south, east, west. */
    neighborStates: {n: ChunkState; s: ChunkState; e: ChunkState; w: ChunkState};
    /** Distance and compass direction to the nearest chunk with a different biome, or `undefined` when generating/mixed. */
    distanceToBiomeEdge: {distance: number; direction: string} | undefined;
    /** Connected loaded-chunk count for the current biome, or `undefined` when generating/mixed. */
    biomeRegionChunks: number | undefined;
    /** `true` when the region extends into unloaded chunks - the count is a lower bound. */
    biomeRegionIsPartial: boolean;
    visibleChunkCount: number;
    loadedChunkCount: number;
    generatingChunkCount: number;
    latestChunkGenerationTimeMs: number;
    averageChunkGenerationTimeMs: number;
    exactFeature: string;
    nearbyFeature: string;
    velocityLabel: string;
    velocityX: number;
    velocityY: number;
    speed: number;
    actualFps: number;
    targetFps: number | undefined;
    spectating: boolean;
}

/**
 * Draws the top-left debug HUD.
 */
export class DebugHud {
    private readonly display: Display;

    public constructor() {
        this.display = new Display({
            foreground: DEBUG_CONFIG.hudTextColor,
            fontFamily: DEBUG_CONFIG.hudFontFamily,
            fontSize: DEBUG_CONFIG.hudFontSize,
        });
    }

    /** A plain top-level text segment. */
    private text(content: string): TextSegment {
        return {content};
    }

    /** A string-valued segment (e.g. a feature tag, biome name, facing direction). */
    private stringValue(text: string): TextSegment {
        return {content: text, style: {foreground: DEBUG_CONFIG.hudStringValueColor}};
    }

    /** A numeric-valued segment - `value` is pre-formatted (may include a unit suffix, e.g. `"12.3 ms"`). */
    private numberValue(value: string): TextSegment {
        return {content: value, style: {foreground: DEBUG_CONFIG.hudNumberValueColor}};
    }

    /** A coloured chunk-state symbol: ● ready, ○ generating, · unloaded. */
    private chunkStateSegment(state: ChunkState): TextSegment {
        if (state === "ready") {
            return {content: "●", style: {foreground: DEBUG_CONFIG.hudNumberValueColor}};
        }
        if (state === "generating") {
            return {content: "○", style: {foreground: DEBUG_CONFIG.hudChunkGeneratingColor}};
        }
        return {content: "·", style: {foreground: DEBUG_CONFIG.hudChunkUnloadedColor}};
    }

    /** Percentage of loaded chunks that are ready (not still generating), `0` if none are loaded. */
    private readyPercent(data: DebugHudData): number {
        if (data.loadedChunkCount === 0) {
            return 0;
        }
        return ((data.loadedChunkCount - data.generatingChunkCount) / data.loadedChunkCount) * 100;
    }

    /**
     * Builds this frame's HUD lines from `data`.
     */
    private buildLines(data: DebugHudData): TextSegment[][] {
        const lines: TextSegment[][] = [
            // FPS — most frequently glanced stat, always first
            [
                this.text("FPS: "), this.numberValue(data.actualFps.toFixed(2)), this.text("/"),
                data.targetFps !== undefined ? this.numberValue(data.targetFps.toFixed(0)) : this.stringValue("uncapped"),
            ],
            // Camera + viewport on one line
            [
                this.text("cam: ("), this.numberValue(data.cameraCenterX.toFixed(1)), this.text(", "), this.numberValue(data.cameraCenterY.toFixed(1)),
                this.text(")  view: "), this.numberValue(String(data.viewportWidth)), this.text("×"), this.numberValue(String(data.viewportHeight)),
            ],
            // Position — tile (grid-aligned), pixel (exact), facing
            [
                this.text("tile ("), this.numberValue(String(data.tileX)), this.text(", "), this.numberValue(String(data.tileY)),
                this.text(")  pos ("), this.numberValue(data.entityX.toFixed(1)), this.text(", "), this.numberValue(data.entityY.toFixed(1)),
                this.text(")"),
            ],
            // Chunk + biome + edge distance + size on one line
            [
                this.text("chunk ("), this.numberValue(String(data.chunkX)), this.text(", "), this.numberValue(String(data.chunkY)),
                this.text(")  biome: "), this.stringValue(data.chunkBiome),
                ...(data.distanceToBiomeEdge !== undefined
                    ? [this.text("  edge: "), this.numberValue(String(data.distanceToBiomeEdge.distance)), this.text("ch "), this.stringValue(data.distanceToBiomeEdge.direction)]
                    : []),
                ...(data.biomeRegionChunks !== undefined
                    ? [this.text("  size: "), this.numberValue(String(data.biomeRegionChunks) + (data.biomeRegionIsPartial ? "+" : "")), this.text("ch")]
                    : []),
            ],
            // Neighbours + feature on one line
            [
                this.text("neighbors: N"), this.chunkStateSegment(data.neighborStates.n),
                this.text(" S"), this.chunkStateSegment(data.neighborStates.s),
                this.text(" E"), this.chunkStateSegment(data.neighborStates.e),
                this.text(" W"), this.chunkStateSegment(data.neighborStates.w),
                this.text("  feature: "), this.stringValue(data.exactFeature),
                ...(data.nearbyFeature !== "none" && data.nearbyFeature !== data.exactFeature
                    ? [this.text(" (nearby: "), this.stringValue(data.nearbyFeature), this.text(")")]
                    : []),
            ],
            // Chunk counts — compact notation
            [
                this.text("chunks: "), this.numberValue(String(data.visibleChunkCount)), this.text(" vis  "),
                this.numberValue(String(data.loadedChunkCount)), this.text(" loaded ("),
                this.numberValue(this.readyPercent(data).toFixed(1)), this.text("%)  "),
                this.numberValue(String(data.generatingChunkCount)), this.text(" gen"),
            ],
            // Generation timing — 3 decimal places is plenty
            [
                this.text("gen: "), this.numberValue(data.averageChunkGenerationTimeMs.toFixed(3)), this.text("ms avg  "),
                this.numberValue(data.latestChunkGenerationTimeMs.toFixed(3)), this.text("ms last"),
            ],
            // Entity motion
            [
                this.stringValue(`[${data.velocityLabel}] `),
                this.text("vel: ("), this.numberValue(data.velocityX.toFixed(1)), this.text(", "), this.numberValue(data.velocityY.toFixed(1)),
                this.text(")  speed: "), this.numberValue(data.speed.toFixed(1)), this.text(" px/s  facing: "), this.stringValue(data.entityFacing),
            ],
        ];
        if (data.spectating) {
            lines.push([{content: "SPECTATOR MODE", style: {foreground: DEBUG_CONFIG.hudSpectatorColor}}]);
        }
        return lines;
    }

    /**
     * Draws the HUD at the top-left of the canvas.
     *
     * @param ctx - Canvas context to draw into.
     * @param data - This frame's HUD data - see {@link DebugHudData}.
     */
    public draw(ctx: CanvasRenderingContext2D, data: DebugHudData): void {
        const lines = this.buildLines(data);

        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const padding = DEBUG_CONFIG.hudPadding;
        const {lines: resolvedLines, width: contentWidth} = this.display.layoutBlock(ctx, lines, 0);
        const contentHeight = resolvedLines.reduce((sum, resolvedLine) => sum + resolvedLine.height, 0)
            + DEBUG_CONFIG.hudLineSpacing * Math.max(0, resolvedLines.length - 1);
        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;

        ctx.fillStyle = DEBUG_CONFIG.hudBackgroundColor;
        ctx.fillRect(0, 0, width, height);

        let y = padding;
        for (const resolvedLine of resolvedLines) {
            this.display.drawLine(ctx, resolvedLine.runs, padding, y, resolvedLine.height);
            y += resolvedLine.height + DEBUG_CONFIG.hudLineSpacing;
        }
    }
}
