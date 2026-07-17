import {FocusableElement, InteractableDisplay} from "../display/interactable-display";
import {DisplayLine} from "../display/input";
import {TextSegment} from "../display/text-style";
import {FLAT_THEME} from "../display/flat-theme";
import {DEBUG_CONFIG} from "./debug-config";
import {copyToClipboard} from "../util";

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
    latestChunkGenerationTimeMs: number;
    averageChunkGenerationTimeMs: number;
    exactFeature: string;
    nearbyFeature: string;
    velocityX: number;
    velocityY: number;
    speed: number;
    actualFps: number;
    targetFps: number | undefined;
    worldSeed: number;
    spectating: boolean;
}

/**
 * Draws the top-left debug HUD.
 */
export class DebugHud {
    private readonly display: InteractableDisplay;

    public constructor() {
        this.display = new InteractableDisplay({
            foreground: DEBUG_CONFIG.hudTextColor,
            fontFamily: DEBUG_CONFIG.hudFontFamily,
            fontSize: DEBUG_CONFIG.hudFontSize,
            lineHeight: DEBUG_CONFIG.hudLineHeight,
        }, FLAT_THEME, "click", null);
    }

    /** A label segment, in the HUD's default text colour. */
    private label(text: string): TextSegment {
        return {content: text};
    }

    /** A string-valued segment (e.g. a feature tag, biome name, facing direction). */
    private stringValue(text: string): TextSegment {
        return {content: text, style: {foreground: DEBUG_CONFIG.hudStringValueColor}};
    }

    /** A numeric-valued segment - `value` is pre-formatted (may include a unit suffix, e.g. `"12.3 ms"`). */
    private numberValue(value: string): TextSegment {
        return {content: value, style: {foreground: DEBUG_CONFIG.hudNumberValueColor}};
    }

    /**
     * Builds this frame's HUD lines from `data`.
     */
    private buildLines(data: DebugHudData): DisplayLine[] {
        const lines: DisplayLine[] = [
            [this.label("camera: ("), this.numberValue(data.cameraCenterX.toFixed(1)), this.label(", "), this.numberValue(data.cameraCenterY.toFixed(1)), this.label(")")],
            [this.label("viewport: "), this.numberValue(String(data.viewportWidth)), this.label(" x "), this.numberValue(String(data.viewportHeight))],
            [
                this.label("entity: ("), this.numberValue(data.entityX.toFixed(1)), this.label(", "), this.numberValue(data.entityY.toFixed(1)),
                this.label("), facing: "), this.stringValue(data.entityFacing),
            ],
            [this.label("chunk ("), this.numberValue(String(data.chunkX)), this.label(", "), this.numberValue(String(data.chunkY)), this.label("), "), this.stringValue(data.chunkBiome)],
            [this.label("chunks: visible="), this.numberValue(String(data.visibleChunkCount)), this.label(", loaded="), this.numberValue(String(data.loadedChunkCount))],
            [
                this.label("chunk gen: latest="), this.numberValue(data.latestChunkGenerationTimeMs.toFixed(6)), this.label(' ms'),
                this.label(", avg="), this.numberValue(data.averageChunkGenerationTimeMs.toFixed(4)), this.label(' ms'),
            ],
            [this.label("feature: exact="), this.stringValue(data.exactFeature), this.label(", nearby="), this.stringValue(data.nearbyFeature)],
            [
                this.label("velocity: ("), this.numberValue(data.velocityX.toFixed(1)), this.label(", "), this.numberValue(data.velocityY.toFixed(1)),
                this.label("), speed: "), this.numberValue(`${data.speed.toFixed(1)} px/s`),
            ],
            [
                this.label("FPS: "), this.numberValue(data.actualFps.toFixed(2)), this.label("/"),
                data.targetFps !== undefined ? this.numberValue(data.targetFps.toFixed(0)) : this.stringValue("uncapped"),
            ],
            [
                this.label("seed: "), this.numberValue(String(data.worldSeed)), this.label(" "),
                {kind: "button", label: "Copy", onClick: () => copyToClipboard(String(data.worldSeed))},
            ],
        ];
        if (data.spectating) {
            lines.push([{content: "SPECTATOR MODE", style: {foreground: DEBUG_CONFIG.hudSpectatorColor}}]);
        }
        return lines;
    }

    /**
     * Called when the HUD is toggled. Used to disable the interactive display.
     *
     * @param visible - Whether debug mode (and so this HUD) is currently shown.
     */
    public setVisible(visible: boolean): void {
        if (visible === this.display.isActive()) {
            return;
        }
        this.display.setActive(visible);
        if (!visible) {
            this.display.setBounds(null);
        }
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
        const resolvedLines = lines.map((line) => this.display.resolveElements(ctx, line));
        const width = Math.max(0, ...resolvedLines.map((line) => line.width)) + padding * 2;
        const height = resolvedLines.reduce((sum, line) => sum + line.height, 0) + padding * 2;

        this.display.setBounds({x: 0, y: 0, w: width, h: height});

        const focusables: FocusableElement[] = [];
        let lineY = padding;
        for (const line of resolvedLines) {
            focusables.push(...this.display.layoutFocusables(line, padding, lineY));
            lineY += line.height;
        }
        this.display.setFocusables(focusables);

        ctx.fillStyle = DEBUG_CONFIG.hudBackgroundColor;
        ctx.fillRect(0, 0, width, height);

        lineY = padding;
        for (const line of resolvedLines) {
            this.display.drawElements(ctx, line, padding, lineY);
            lineY += line.height;
        }
    }
}
