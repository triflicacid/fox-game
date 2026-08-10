import {Display} from "@display/display";
import {TextSegment} from "@display/text-style";
import {DEBUG_CONFIG} from "./debug-config";
import {HudBase} from "./hud-base";
import type {ChunkCacheState} from "../world/chunks/chunk";

/** Readiness state of a single chunk, for the neighbour indicator. */
export type ChunkState = "ready" | "generating" | "unloaded";

export interface DebugHudData {
    cameraCenterX: number;
    cameraCenterY: number;
    viewportWidth: number;
    viewportHeight: number;
    zoom: number;
    entityX: number;
    entityY: number;
    entityFacing: string;
    tileX: number;
    tileY: number;
    chunkX: number;
    chunkY: number;
    chunkBiome: string;
    chunkCacheState: ChunkCacheState | "pending";
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
    exactStructure: string;
    nearbyStructure: string;
    velocityLabel: string;
    velocityX: number;
    velocityY: number;
    speed: number;
    actualFps: number;
    targetFps: number | undefined;
    spectating: boolean;
    /** Whether the main entity is overlapping a collidable tile/structure piece as of this tick - see `World.handleEntityCollisions`. */
    collision: boolean;
    /** The colliding entity's display name. Only meaningful while {@link collision} is `true`. */
    collisionEntity: string;
    /** The obstacle it collided with, as a short label (kind, name, tile position). Only meaningful while {@link collision} is `true`. */
    collisionObstacle: string;
}

/** Renders one debug HUD snapshot. */
export interface DebugHudRenderer {
    /** Draws the supplied debug data. */
    draw(ctx: CanvasRenderingContext2D, data: DebugHudData): void;
}

/**
 * Draws the top-left debug HUD.
 */
export class DebugHud extends HudBase implements DebugHudRenderer {
    private readonly display: Display;

    public constructor() {
        super();
        this.display = new Display({
            foreground: DEBUG_CONFIG.hudTextColor,
            fontFamily: DEBUG_CONFIG.hudFontFamily,
            fontSize: DEBUG_CONFIG.hudFontSize,
        });
    }


    /** A coloured true/false segment for the collision indicator - lime when colliding, tomato when not. */
    private collisionValue(collision: boolean): TextSegment {
        return {
            content: collision ? "true" : "false",
            style: {foreground: collision ? DEBUG_CONFIG.hudCollisionTrueColor : DEBUG_CONFIG.hudCollisionFalseColor},
        };
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
            // FPS
            [
                this.text("FPS: "), this.numberValue(data.actualFps.toFixed(2)), this.text("/"),
                data.targetFps !== undefined ? this.numberValue(data.targetFps.toFixed(0)) : this.stringValue("uncapped"),
            ],
            // Camera + viewport on one line
            [
                this.text("cam: ("), this.numberValue(data.cameraCenterX.toFixed(1)), this.text(", "), this.numberValue(data.cameraCenterY.toFixed(1)),
                this.text(")  view: "), this.numberValue(data.viewportWidth.toFixed(0)), this.text("x"), this.numberValue(data.viewportHeight.toFixed(0)),
                this.text("  zoom: "), this.numberValue(`${data.zoom.toFixed(2)}x`),
            ],
            // Position: tile (grid-aligned), pixel (exact), facing
            [
                this.text("tile ("), this.numberValue(String(data.tileX)), this.text(", "), this.numberValue(String(data.tileY)),
                this.text(")  pos ("), this.numberValue(data.entityX.toFixed(1)), this.text(", "), this.numberValue(data.entityY.toFixed(1)),
                this.text(")  facing: "), this.stringValue(data.entityFacing),
            ],
            // Chunk + cache state + biome + edge distance + size
            [
                this.text("chunk ("), this.numberValue(String(data.chunkX)), this.text(", "), this.numberValue(String(data.chunkY)),
                this.text(") ["), this.stringValue(data.chunkCacheState), this.text("]"),
                this.text("  biome: "), this.stringValue(data.chunkBiome),
                ...(data.distanceToBiomeEdge !== undefined
                    ? [this.text("  edge: "), this.numberValue(String(data.distanceToBiomeEdge.distance)), this.text("ch "), this.stringValue(data.distanceToBiomeEdge.direction)]
                    : []),
                ...(data.biomeRegionChunks !== undefined
                    ? [this.text("  size: "), this.numberValue(String(data.biomeRegionChunks) + (data.biomeRegionIsPartial ? "+" : "")), this.text("ch")]
                    : []),
            ],
            // Neighbours + feature
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
            // Structure (e.g. a tree's trunk/leaf sprite)
            [
                this.text("structure: "), this.stringValue(data.exactStructure),
                ...(data.nearbyStructure !== "none" && data.nearbyStructure !== data.exactStructure
                    ? [this.text(" (nearby: "), this.stringValue(data.nearbyStructure), this.text(")")]
                    : []),
            ],
            // Chunk counts
            [
                this.text("chunks: "), this.numberValue(String(data.visibleChunkCount)), this.text(" vis  "),
                this.numberValue(String(data.loadedChunkCount)), this.text(" loaded ("),
                this.numberValue(this.readyPercent(data).toFixed(1)), this.text("%)  "),
                this.numberValue(String(data.generatingChunkCount)), this.text(" gen"),
            ],
            // Generation timing
            [
                this.text("gen: "), this.numberValue(data.averageChunkGenerationTimeMs.toFixed(3)), this.text("ms avg  "),
                this.numberValue(data.latestChunkGenerationTimeMs.toFixed(3)), this.text("ms last"),
            ],
            // Entity motion
            [
                this.stringValue(`[${data.velocityLabel}] `),
                this.text("vel: ("), this.numberValue(data.velocityX.toFixed(1)), this.text(", "), this.numberValue(data.velocityY.toFixed(1)),
                this.text(")  speed: "), this.numberValue(data.speed.toFixed(1)), this.text(" px/s"),
            ],
            // Collision indicator - lime/true with entity + obstacle detail when colliding, tomato/false otherwise
            [
                this.text("collision: "), this.collisionValue(data.collision),
                ...(data.collision
                    ? [this.text("  "), this.stringValue(data.collisionEntity), this.text(" vs "), this.stringValue(data.collisionObstacle)]
                    : []),
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

        this.setupContext(ctx);

        const padding = DEBUG_CONFIG.hudPadding;
        const {lines: resolvedLines, width: contentWidth} = this.display.layoutBlock(ctx, lines, 0);
        const contentHeight = resolvedLines.reduce((sum, resolvedLine) => sum + resolvedLine.height, 0)
            + DEBUG_CONFIG.hudLineSpacing * Math.max(0, resolvedLines.length - 1);
        const width = contentWidth + padding * 2;
        const height = contentHeight + padding * 2;

        this.drawBackground(ctx, 0, 0, width, height);

        let y = padding;
        for (const resolvedLine of resolvedLines) {
            this.display.drawLine(ctx, resolvedLine.runs, padding, y, resolvedLine.height);
            y += resolvedLine.height + DEBUG_CONFIG.hudLineSpacing;
        }
    }
}
