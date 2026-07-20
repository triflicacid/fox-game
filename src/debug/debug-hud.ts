import {InteractableDisplay} from "../lib/display/interactable-display";
import {DisplayLine} from "../lib/display/input";
import {TextSegment} from "../lib/display/text-style";
import {FLAT_THEME} from "../lib/display/flat-theme";
import {button, line} from "../lib/display/builders";
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
    /** The seed line's button's current label - see {@link updateButtonText}. */
    private copyButtonLabel = "Copy";
    /** Pending revert-to-"Copy" timer from the last click, if any. */
    private copyRevertTimeoutId: ReturnType<typeof setTimeout> | null = null;

    public constructor() {
        this.display = new InteractableDisplay({
            foreground: DEBUG_CONFIG.hudTextColor,
            fontFamily: DEBUG_CONFIG.hudFontFamily,
            fontSize: DEBUG_CONFIG.hudFontSize,
        }, FLAT_THEME, "click", null);
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
     * Updates the seed line's button's displayed label.
     */
    private updateButtonText(label: string): void {
        this.copyButtonLabel = label;
    }

    /**
     * The seed line's button's action: copies `seed` to the clipboard, shows
     * "Copied" for {@link DEBUG_CONFIG.hudCopyFeedbackDurationMs}, then
     * reverts to "Copy". Restarts the revert timer if clicked again mid-feedback.
     */
    private handleCopyClick(seed: number): void {
        copyToClipboard(String(seed));
        this.updateButtonText("Copied");

        if (this.copyRevertTimeoutId !== null) {
            clearTimeout(this.copyRevertTimeoutId);
        }
        this.copyRevertTimeoutId = setTimeout(() => {
            this.copyRevertTimeoutId = null;
            this.updateButtonText("Copy");
        }, DEBUG_CONFIG.hudCopyFeedbackDurationMs);
    }

    /**
     * Builds this frame's HUD lines from `data`.
     */
    private buildLines(data: DebugHudData): DisplayLine[] {
        const lines: DisplayLine[] = [
            line().content("camera: (").content(this.numberValue(data.cameraCenterX.toFixed(1))).content(", ").content(this.numberValue(data.cameraCenterY.toFixed(1))).content(")"),
            line().content("viewport: ").content(this.numberValue(String(data.viewportWidth))).content(" x ").content(this.numberValue(String(data.viewportHeight))),
            line()
                .content("entity: (").content(this.numberValue(data.entityX.toFixed(1))).content(", ").content(this.numberValue(data.entityY.toFixed(1)))
                .content("), facing: ").content(this.stringValue(data.entityFacing)),
            line()
                .content("chunk (").content(this.numberValue(String(data.chunkX))).content(", ").content(this.numberValue(String(data.chunkY)))
                .content("), ").content(this.stringValue(data.chunkBiome)),
            line().content("chunks: visible=").content(this.numberValue(String(data.visibleChunkCount))).content(", loaded=").content(this.numberValue(String(data.loadedChunkCount))),
            line()
                .content("chunk gen: latest=").content(this.numberValue(data.latestChunkGenerationTimeMs.toFixed(6))).content(" ms")
                .content(", avg=").content(this.numberValue(data.averageChunkGenerationTimeMs.toFixed(4))).content(" ms"),
            line().content("feature: exact=").content(this.stringValue(data.exactFeature)).content(", nearby=").content(this.stringValue(data.nearbyFeature)),
            line()
                .content("velocity: (").content(this.numberValue(data.velocityX.toFixed(1))).content(", ").content(this.numberValue(data.velocityY.toFixed(1)))
                .content("), speed: ").content(this.numberValue(data.speed.toFixed(1))).content(" px/s"),
            line()
                .content("FPS: ").content(this.numberValue(data.actualFps.toFixed(2))).content("/")
                .content(data.targetFps !== undefined ? this.numberValue(data.targetFps.toFixed(0)) : this.stringValue("uncapped")),
            line()
                .content("seed: ").content(this.numberValue(String(data.worldSeed))).content(" ")
                .content(button({content: this.copyButtonLabel, onClick: () => this.handleCopyClick(data.worldSeed), disabled: this.copyRevertTimeoutId !== null})),
        ];
        if (data.spectating) {
            lines.push(line().content({content: "SPECTATOR MODE", style: {foreground: DEBUG_CONFIG.hudSpectatorColor}}));
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
            this.display.setClickRegion(null);
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
        this.display.beginResolvePass();
        const {rows, width: contentWidth, height: contentHeight} = this.display.resolveLines(ctx, lines, DEBUG_CONFIG.hudLineSpacing);
        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;

        this.display.setClickRegion({x: 0, y: 0, w: width, h: height});
        this.display.setFocusables(this.display.layoutLineFocusables(rows, padding, padding, DEBUG_CONFIG.hudLineSpacing));

        ctx.fillStyle = DEBUG_CONFIG.hudBackgroundColor;
        ctx.fillRect(0, 0, width, height);

        this.display.drawLines(ctx, rows, padding, padding, DEBUG_CONFIG.hudLineSpacing);
        this.display.drawOverlays(ctx);
    }
}
