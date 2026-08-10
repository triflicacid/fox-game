import {Display} from "@display/display";
import {TextSegment} from "@display/text-style";
import {DEBUG_CONFIG} from "./debug-config";
import {HudBase} from "./hud-base";
import {EntityHoverInfo, MinimapHoverInfo, TileHoverInfo} from "../world/hover-info";
import {CollisionResponseKind} from "../geometry/collision-response";

/** Everything {@link HoverTooltip.draw} needs for one frame. */
export type HoverTooltipData =
    | {
        kind: "world";
        /** World-pixel point under the cursor. */
        worldX: number;
        worldY: number;
        /** The hovered tile, or `undefined` if its containing chunk isn't ready yet. */
        tile: TileHoverInfo | undefined;
        /** The topmost entity under the cursor, if any. */
        entity: EntityHoverInfo | undefined;
        /** The currently-viewed noise field's name and its sample at the hovered tile, if a noise field overlay is on - see `World.getNoiseFieldSample`. */
        noiseField: {name: string; value: number} | undefined;
    }
    | {
        kind: "minimap";
        /** The hovered minimap region - see `World.getMinimapHoverInfo`. */
        minimap: MinimapHoverInfo;
    };

/**
 * Draws a small tooltip next to the cursor showing whatever tile/structure/
 * entity is currently hovered - toggled with the `i` key (see
 * {@link DebugController.isHoverInfoEnabled}).
 */
export class HoverTooltip extends HudBase {
    private readonly display: Display;

    public constructor() {
        super();
        this.display = new Display({
            foreground: DEBUG_CONFIG.hudTextColor,
            fontFamily: DEBUG_CONFIG.hudFontFamily,
            fontSize: DEBUG_CONFIG.hudFontSize,
        });
    }


    /** Several string-valued segments (e.g. stacked structure sprites), each its own colour, joined by plain `", "` separators rather than one comma-included blob. */
    private stringValueList(values: readonly string[]): TextSegment[] {
        return values.flatMap((value, index) => index === 0 ? [this.stringValue(value)] : [this.text(", "), this.stringValue(value)]);
    }

    /** A `"<label> collidable: true (<kind>)"` line, e.g. `"tile collidable: true (solid)"` - only meaningful to call once `collision` is known non-`undefined`. */
    private collidableLine(label: string, collision: Exclude<CollisionResponseKind, "none">): TextSegment[] {
        return [
            this.text(`${label} collidable: `), this.boolValue(true),
            this.text(" ("), this.stringValue(collision), this.text(")"),
        ];
    }

    /** Builds this frame's tooltip lines from `data`. */
    private buildLines(data: HoverTooltipData): TextSegment[][] {
        if (data.kind === "minimap") {
            return [
                [
                    this.text("region ("), this.numberValue(String(data.minimap.tileX)), this.text(", "),
                    this.numberValue(String(data.minimap.tileY)), this.text(")"),
                ],
                [this.text("biome: "), this.stringValue(data.minimap.biomeTag)],
            ];
        }

        const lines: TextSegment[][] = [
            [
                this.text("world ("), this.numberValue(data.worldX.toFixed(0)), this.text(", "),
                this.numberValue(data.worldY.toFixed(0)), this.text(")"),
            ],
        ];

        if (data.tile) {
            const {tile} = data;
            lines.push([
                this.text("tile ("), this.numberValue(String(tile.tileX)), this.text(", "),
                this.numberValue(String(tile.tileY)), this.text(")"),
            ]);
            lines.push([
                this.text("ground: "), this.stringValue(tile.groundType),
                this.text("  biome: "), this.stringValue(tile.biomeTag),
            ]);
            if (tile.featureTag !== "none") {
                lines.push([this.text("feature: "), this.stringValue(tile.featureTag)]);
            }
            if (tile.collision) {
                lines.push(this.collidableLine("tile", tile.collision));
            }
            if (tile.animated) {
                lines.push([
                    this.text("animated: "), this.boolValue(true),
                    this.text(" ("), this.stringValue(tile.animated.sync), this.text(", "),
                    this.numberValue(String(tile.animated.frameIntervalMs)), this.text("ms)"),
                ]);
            }
            if (tile.structure) {
                lines.push([
                    this.text("structure: "), ...this.stringValueList(tile.structure.sprites),
                    this.text(" ("), this.stringValue(tile.structure.structureId), this.text("/"),
                    this.stringValue(tile.structure.layer), this.text(")"),
                ]);
                if (tile.structure.collision) {
                    lines.push(this.collidableLine("structure", tile.structure.collision));
                }
            }
        } else {
            lines.push([this.stringValue("(chunk not generated)")]);
        }

        if (data.entity) {
            const {entity} = data;
            lines.push([
                this.text("entity: "), this.stringValue(entity.name),
                this.text("  status: "), this.stringValue(entity.status),
            ]);
            lines.push([
                this.text("pos ("), this.numberValue(entity.x.toFixed(1)), this.text(", "),
                this.numberValue(entity.y.toFixed(1)), this.text(")"),
            ]);
            if (entity.velocity) {
                lines.push([
                    this.text("vel ("), this.numberValue(entity.velocity.x.toFixed(1)), this.text(", "),
                    this.numberValue(entity.velocity.y.toFixed(1)), this.text(")"),
                ]);
            }
        }

        if (data.noiseField) {
            lines.push([
                this.text("field "), this.stringValue(data.noiseField.name), this.text(": "),
                this.numberValue(data.noiseField.value.toFixed(3)),
            ]);
        }

        return lines;
    }

    /**
     * Draws the tooltip next to `(screenX, screenY)`, clamped so it always
     * stays fully within the canvas.
     *
     * @param ctx - Canvas context to draw into.
     * @param screenX - Cursor's X position, in canvas pixels.
     * @param screenY - Cursor's Y position, in canvas pixels.
     * @param canvasWidth - Canvas width, in canvas pixels.
     * @param canvasHeight - Canvas height, in canvas pixels.
     * @param data - This frame's hover data - see {@link HoverTooltipData}.
     */
    public draw(
        ctx: CanvasRenderingContext2D,
        screenX: number,
        screenY: number,
        canvasWidth: number,
        canvasHeight: number,
        data: HoverTooltipData,
    ): void {
        const lines = this.buildLines(data);

        this.setupContext(ctx);

        const padding = DEBUG_CONFIG.hudPadding;
        const {lines: resolvedLines, width: contentWidth} = this.display.layoutBlock(ctx, lines, 0);
        const contentHeight = resolvedLines.reduce((sum, resolvedLine) => sum + resolvedLine.height, 0)
            + DEBUG_CONFIG.hudLineSpacing * Math.max(0, resolvedLines.length - 1);
        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;

        let x = screenX + DEBUG_CONFIG.tooltipOffsetX;
        let y = screenY + DEBUG_CONFIG.tooltipOffsetY;
        if (x + width > canvasWidth) {
            x = screenX - DEBUG_CONFIG.tooltipOffsetX - width;
        }
        if (y + height > canvasHeight) {
            y = screenY - DEBUG_CONFIG.tooltipOffsetY - height;
        }
        x = Math.max(0, x);
        y = Math.max(0, y);

        this.drawBackground(ctx, x, y, width, height);

        let lineY = y + padding;
        for (const resolvedLine of resolvedLines) {
            this.display.drawLine(ctx, resolvedLine.runs, x + padding, lineY, resolvedLine.height);
            lineY += resolvedLine.height + DEBUG_CONFIG.hudLineSpacing;
        }
    }
}
