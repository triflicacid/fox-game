import {TextSegment} from "@display/text-style";
import {DEBUG_CONFIG} from "./debug-config";

/**
 * Abstract base class for canvas-rendered HUD panels.
 *
 * Provides the text-segment factory helpers used by every HUD ({@link text},
 * {@link numberValue}, {@link stringValue}) and two small canvas utilities
 * ({@link setupContext}, {@link drawBackground}) that every `draw` method
 * repeats verbatim.
 */
export abstract class HudBase {
    /** A plain top-level text segment. */
    protected text(content: string): TextSegment {
        return {content};
    }

    /** A numeric-valued segment - `value` is pre-formatted (may include a unit suffix). */
    protected numberValue(value: string): TextSegment {
        return {content: value, style: {foreground: DEBUG_CONFIG.hudNumberValueColor}};
    }

    /** A string-valued segment (e.g. a feature tag, biome name, facing direction). */
    protected stringValue(text: string): TextSegment {
        return {content: text, style: {foreground: DEBUG_CONFIG.hudStringValueColor}};
    }

    /** A coloured true/false segment - lime when `true`, tomato when `false`. */
    protected boolValue(value: boolean): TextSegment {
        return {
            content: value ? "true" : "false",
            style: {foreground: value ? DEBUG_CONFIG.hudCollisionTrueColor : DEBUG_CONFIG.hudCollisionFalseColor},
        };
    }

    /**
     * Configures the canvas context for HUD rendering.
     * Must be called at the start of every `draw` implementation.
     */
    protected setupContext(ctx: CanvasRenderingContext2D): void {
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
    }

    /** Fills a background rectangle using the shared HUD background colour. */
    protected drawBackground(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        ctx.fillStyle = DEBUG_CONFIG.hudBackgroundColor;
        ctx.fillRect(x, y, width, height);
    }
}

