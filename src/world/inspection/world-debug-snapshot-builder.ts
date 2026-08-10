import type {Camera} from "../../camera/camera";
import type {MovableEntity} from "../../entities/movable-entity";
import {toCompassDirection} from "../../geometry/direction";
import type {Vector2d} from "../../geometry/vector2d";
import {type ChunkState, type DebugHudData} from "../../debug/debug-hud";
import {type BiomeSummary} from "../generation/biome/biome";
import {type FeatureTag} from "../generation/feature/feature-tag";
import {CoordSet} from "../coordinates/coord-set";
import {pixelRectToTileRange, tileToChunk} from "../coordinates/world-grid-math";
import {dominantNonNoneLabel} from "./dominant-label";
import {type GeneratingWorldGrid, type ReadyWorldGrid} from "../tiles/world-grid-view";

/** Per-frame inputs that vary between draws, renamed from the private DebugHudOptions. */
export interface WorldDebugSnapshotOptions {
    /** Whether spectator mode is active this frame. */
    spectating: boolean;
    /** Camera pan velocity while spectating; ignored otherwise. */
    spectatorVelocity: Vector2d;
    /** Currently measured FPS. */
    actualFps: number;
    /** FPS cap, or `undefined` when uncapped. */
    targetFps: number | undefined;
}

/** Connected loaded-chunk count for a biome region. */
export interface BiomeRegionSize {
    /** Number of connected ready chunks sharing the biome. */
    count: number;
    /** `true` when the region reaches an unloaded or generating chunk. */
    isPartial: boolean;
}

/** Internal biome region cache record, extending the public result with the anchor position. */
interface BiomeRegionCacheEntry extends BiomeRegionSize {
    anchorChunkX: number;
    anchorChunkY: number;
}

/** Builds {@link DebugHudData} snapshots for the debug HUD. */
export class WorldDebugSnapshotBuilder {
    private readonly biomeRegionCache = new Map<BiomeSummary, BiomeRegionCacheEntry>();

    public constructor(
        private readonly tileSize: number,
        private readonly readyGrid: ReadyWorldGrid,
        private readonly generatingGrid: GeneratingWorldGrid,
    ) {}

    /** Clears the biome-region BFS cache; call whenever the world seed changes. */
    public clearBiomeRegionCache(): void {
        this.biomeRegionCache.clear();
    }

    /**
     * Returns the connected loaded-chunk count for `biome` from `(chunkX, chunkY)`.
     * Results are BFS-cached per biome and reused while the original anchor chunk
     * stays loaded.
     */
    public getBiomeRegionSize(chunkX: number, chunkY: number, biome: BiomeSummary): BiomeRegionSize {
        const cached = this.biomeRegionCache.get(biome);
        if (cached && this.readyGrid.isChunkLoaded(cached.anchorChunkX, cached.anchorChunkY)) {
            return cached;
        }

        const NEIGHBORS = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}] as const;
        const visited = new CoordSet();
        const matched = new CoordSet();
        const queue: {chunkX: number; chunkY: number}[] = [{chunkX, chunkY}];
        visited.add(chunkX, chunkY);
        matched.add(chunkX, chunkY);
        let isPartial = false;

        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) {
                continue;
            }
            const {chunkX: cx, chunkY: cy} = next;
            for (const {dx, dy} of NEIGHBORS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (visited.has(nx, ny)) {
                    continue;
                }
                visited.add(nx, ny);
                const neighbor = this.readyGrid.getLoadedChunk(nx, ny);
                if (!neighbor?.isReady()) {
                    isPartial = true;
                    continue;
                }
                if (neighbor.getBiomeSummary() === biome) {
                    matched.add(nx, ny);
                    queue.push({chunkX: nx, chunkY: ny});
                }
            }
        }

        const result: BiomeRegionCacheEntry = {count: matched.size, isPartial, anchorChunkX: chunkX, anchorChunkY: chunkY};
        this.biomeRegionCache.set(biome, result);
        return result;
    }

    /**
     * Returns the minimum chunk-grid distance and direction to a ready chunk
     * with a different pure biome, searching up to 16 chunks from the anchor.
     */
    public getDistanceToBiomeEdge(
        chunkX: number,
        chunkY: number,
        biome: BiomeSummary,
    ): {distance: number; direction: string} | undefined {
        const MAX_SEARCH_DISTANCE = 16;
        const visited = new CoordSet();
        visited.add(chunkX, chunkY);
        let currentRing = [{chunkX, chunkY}];

        for (let distance = 1; distance <= MAX_SEARCH_DISTANCE; distance++) {
            const nextRing: {chunkX: number; chunkY: number}[] = [];
            let sumDx = 0;
            let sumDy = 0;
            let foundCount = 0;

            for (const {chunkX: cx, chunkY: cy} of currentRing) {
                for (const {dx, dy} of [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}]) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (visited.has(nx, ny)) {
                        continue;
                    }
                    visited.add(nx, ny);
                    const neighbor = this.readyGrid.getLoadedChunk(nx, ny);
                    if (!neighbor?.isReady()) {
                        continue;
                    }
                    const neighborBiome = neighbor.getBiomeSummary();
                    if (neighborBiome !== biome && neighborBiome !== "" && neighborBiome !== "mixed") {
                        sumDx += nx - chunkX;
                        sumDy += ny - chunkY;
                        foundCount++;
                    } else {
                        nextRing.push({chunkX: nx, chunkY: ny});
                    }
                }
            }

            if (foundCount > 0) {
                return {distance, direction: toCompassDirection(sumDx / foundCount, sumDy / foundCount)};
            }
            if (nextRing.length === 0) {
                break;
            }
            currentRing = nextRing;
        }
        return undefined;
    }

    /** The most-represented feature tag across the pixel rectangle; delegates to {@link dominantNonNoneLabel}. */
    public dominantFeatureLabel(x: number, y: number, w: number, h: number): FeatureTag {
        const range = pixelRectToTileRange(x, y, w, h, this.tileSize);
        return dominantNonNoneLabel(range, (tileX, tileY) => this.generatingGrid.requestFeatureTag(tileX, tileY));
    }

    /** The most-represented structure tag across the pixel rectangle; delegates to {@link dominantNonNoneLabel}. */
    public dominantStructureLabel(x: number, y: number, w: number, h: number): string {
        const range = pixelRectToTileRange(x, y, w, h, this.tileSize);
        return dominantNonNoneLabel(range, (tileX, tileY) => this.generatingGrid.requestStructureTag(tileX, tileY));
    }

    /** Builds a complete debug HUD data snapshot. Does not call any renderer. */
    public build(
        camera: Camera,
        mainEntity: MovableEntity,
        options: WorldDebugSnapshotOptions,
        visibleChunkCount: number,
        loadedChunkCount: number,
        generatingChunkCount: number,
        latestGenerationTimeMs: number,
        averageGenerationTimeMs: number,
        lastCollision: {entityLabel: string; obstacleLabel: string} | undefined,
    ): DebugHudData {
        const {spectating, spectatorVelocity, actualFps, targetFps} = options;
        const center = camera.getCenter();
        const position = mainEntity.getPosition();
        const velocity = spectating ? spectatorVelocity : mainEntity.getVelocity();
        const velocityLabel = spectating ? "Spectator" : mainEntity.getDisplayName();
        const speed = Math.hypot(velocity.x, velocity.y);
        const tileX = Math.floor(position.x / this.tileSize);
        const tileY = Math.floor(position.y / this.tileSize);
        const {chunkX, chunkY} = tileToChunk(tileX, tileY);
        const chunk = this.generatingGrid.requestChunk(chunkX, chunkY);
        const chunkBiome = chunk.isReady() ? chunk.getBiomeSummary() : "generating...";
        const chunkCacheState = chunk.isReady() ? chunk.getCacheState() : "pending";
        const readyBiome = chunk.getBiomeSummary();
        const biomeRegion =
            chunk.isReady() && readyBiome !== "" && readyBiome !== "mixed"
                ? this.getBiomeRegionSize(chunkX, chunkY, readyBiome)
                : undefined;
        const exactFeature = this.generatingGrid.requestFeatureTag(tileX, tileY);
        const rect = mainEntity.getBoundingRect();
        const nearbyFeature = this.dominantFeatureLabel(rect.x, rect.y, rect.w, rect.h);
        const exactStructure = this.generatingGrid.requestStructureTag(tileX, tileY);
        const nearbyStructure = this.dominantStructureLabel(rect.x, rect.y, rect.w, rect.h);
        const distanceToBiomeEdge =
            chunk.isReady() && readyBiome !== "" && readyBiome !== "mixed"
                ? this.getDistanceToBiomeEdge(chunkX, chunkY, readyBiome)
                : undefined;

        const toChunkState = (cx: number, cy: number): ChunkState => {
            const c = this.readyGrid.getLoadedChunk(cx, cy);
            if (!c) {
                return "unloaded";
            }
            return c.isReady() ? "ready" : "generating";
        };
        const neighborStates = {
            n: toChunkState(chunkX, chunkY - 1),
            s: toChunkState(chunkX, chunkY + 1),
            e: toChunkState(chunkX + 1, chunkY),
            w: toChunkState(chunkX - 1, chunkY),
        };

        return {
            cameraCenterX: center.x,
            cameraCenterY: center.y,
            viewportWidth: camera.getWidth(),
            viewportHeight: camera.getHeight(),
            zoom: camera.getZoom(),
            entityX: position.x,
            entityY: position.y,
            entityFacing: mainEntity.getFacing(),
            tileX,
            tileY,
            chunkX,
            chunkY,
            chunkBiome,
            chunkCacheState,
            neighborStates,
            distanceToBiomeEdge,
            biomeRegionChunks: biomeRegion?.count,
            biomeRegionIsPartial: biomeRegion?.isPartial ?? false,
            visibleChunkCount,
            loadedChunkCount,
            generatingChunkCount,
            latestChunkGenerationTimeMs: latestGenerationTimeMs,
            averageChunkGenerationTimeMs: averageGenerationTimeMs,
            exactFeature,
            nearbyFeature,
            exactStructure,
            nearbyStructure,
            velocityLabel,
            velocityX: velocity.x,
            velocityY: velocity.y,
            speed,
            actualFps,
            targetFps,
            spectating,
            collision: lastCollision !== undefined,
            collisionEntity: lastCollision?.entityLabel ?? "",
            collisionObstacle: lastCollision?.obstacleLabel ?? "",
        };
    }
}

