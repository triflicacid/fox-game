import {Display} from "@lib/display/display";
import {TextSegment} from "@lib/display/text-style";
import {DEBUG_CONFIG} from "./debug-config";

/**
 * Everything the debug HUD needs to render one frame - gathered by whoever
 * owns the world/camera/entities, so {@link DebugHud} itself stays
 * decoupled from `World`.
 */
export interface DebugHudData {
    cameraCenterX: number;
    cameraCenterY: number;
    viewportWidth: number;
    viewportHeight: number;
    entityX: number;
    entityY: number;
    entityFacing: string;
    chunkX: number;
    chunkY: number;
    chunkBiome: string;
    visibleChunkCount: number;
    loadedChunkCount: number;
    generatingChunkCount: number;
    latestChunkGenerationTimeMs: number;
    averageChunkGenerationTimeMs: number;
    exactFeature: string;
    nearbyFeature: string;
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
            [this.text("camera: ("), this.numberValue(data.cameraCenterX.toFixed(1)), this.text(", "), this.numberValue(data.cameraCenterY.toFixed(1)), this.text(")")],
            [this.text("viewport: "), this.numberValue(String(data.viewportWidth)), this.text(" x "), this.numberValue(String(data.viewportHeight))],
            [
                this.text("entity: ("), this.numberValue(data.entityX.toFixed(1)), this.text(", "), this.numberValue(data.entityY.toFixed(1)),
                this.text("), facing: "), this.stringValue(data.entityFacing),
            ],
            [
                this.text("chunk ("), this.numberValue(String(data.chunkX)), this.text(", "), this.numberValue(String(data.chunkY)),
                this.text("), "), this.stringValue(data.chunkBiome),
            ],
            [
                this.text("chunks: visible="), this.numberValue(String(data.visibleChunkCount)),
                this.text(", loaded="), this.numberValue(String(data.loadedChunkCount)),
                this.text(" ("), this.numberValue(this.readyPercent(data).toFixed(1)), this.text("%)"),
                this.text(", generating="), this.numberValue(String(data.generatingChunkCount)),
            ],
            [
                this.text("chunk gen: latest="), this.numberValue(data.latestChunkGenerationTimeMs.toFixed(6)), this.text(" ms"),
                this.text(", avg="), this.numberValue(data.averageChunkGenerationTimeMs.toFixed(4)), this.text(" ms"),
            ],
            [this.text("feature: exact="), this.stringValue(data.exactFeature), this.text(", nearby="), this.stringValue(data.nearbyFeature)],
            [
                this.text("velocity: ("), this.numberValue(data.velocityX.toFixed(1)), this.text(", "), this.numberValue(data.velocityY.toFixed(1)),
                this.text("), speed: "), this.numberValue(data.speed.toFixed(1)), this.text(" px/s"),
            ],
            [
                this.text("FPS: "), this.numberValue(data.actualFps.toFixed(2)), this.text("/"),
                data.targetFps !== undefined ? this.numberValue(data.targetFps.toFixed(0)) : this.stringValue("uncapped"),
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
