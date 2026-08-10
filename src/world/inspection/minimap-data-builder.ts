import type {Camera} from "../../camera/camera";
import type {MovableEntity} from "../../entities/movable-entity";
import {type MinimapData, type MinimapMarker} from "../../minimap/minimap";
import {MINIMAP_CONFIG} from "../../minimap/minimap-config";
import type {MinimapStatsHudData} from "../../minimap/minimap-stats-hud";
import {BIOME_COLORS} from "../generation/biome/biome-colors";
import {type BiomeTag} from "../generation/biome/biome";
import {getFieldGradient, sampleGradient} from "../generation/noise-field-colors";
import type {WorldGenerationView} from "../generation/world-generation-view";
import {Vector2d} from "../../geometry/vector2d";

/** Builds per-frame {@link MinimapData} and {@link MinimapStatsHudData} snapshots. */
export class MinimapDataBuilder {
    public constructor(
        private readonly tileSize: number,
        private readonly generationView: WorldGenerationView,
        private readonly readMainEntity: () => MovableEntity,
    ) {}

    /** Builds minimap data for the current frame. */
    public build(
        center: Vector2d,
        spectating: boolean,
        camera: Camera,
        debugEnabled: boolean,
        noiseFieldName?: string,
    ): MinimapData {
        const centerTile = center.scale(1 / this.tileSize);
        const marker: MinimapMarker = spectating
            ? {kind: "spectator"}
            : {kind: "entity", facing: this.readMainEntity().getFacingVector()};
        const worldTilesPerPixel = MINIMAP_CONFIG.worldTilesPerPixel / camera.getZoom();

        if (debugEnabled && noiseFieldName) {
            const gradient = getFieldGradient(noiseFieldName);
            return {
                centerTile,
                marker,
                worldTilesPerPixel,
                modeKey: `noise:${noiseFieldName}`,
                sampleColor: (tileX, tileY) =>
                    sampleGradient(gradient, this.generationView.getSample(noiseFieldName, tileX, tileY) ?? 0),
            };
        }

        return {
            centerTile,
            marker,
            worldTilesPerPixel,
            modeKey: "biome",
            sampleColor: (tileX, tileY) => BIOME_COLORS[this.generationView.resolveBiomeTagAt(tileX, tileY)],
        };
    }

    /** Derives minimap statistics from already-built minimap data. */
    public buildStats(minimapData: MinimapData): MinimapStatsHudData {
        const {centerTile, worldTilesPerPixel} = minimapData;
        const halfSpanTiles = (MINIMAP_CONFIG.boxSizePx / 2) * worldTilesPerPixel;
        const minTileX = centerTile.x - halfSpanTiles;
        const minTileY = centerTile.y - halfSpanTiles;
        const maxTileX = centerTile.x + halfSpanTiles;
        const maxTileY = centerTile.y + halfSpanTiles;

        const biomeCounts: Record<BiomeTag, number> = {plains: 0, desert: 0, forest: 0, tundra: 0};
        const grid = MINIMAP_CONFIG.statsBiomeSampleGrid;
        const spanX = maxTileX - minTileX;
        const spanY = maxTileY - minTileY;
        for (let iy = 0; iy < grid; iy++) {
            const tileY = minTileY + ((iy + 0.5) / grid) * spanY;
            for (let ix = 0; ix < grid; ix++) {
                const tileX = minTileX + ((ix + 0.5) / grid) * spanX;
                biomeCounts[this.generationView.resolveBiomeTagAt(tileX, tileY)]++;
            }
        }

        return {minTileX, minTileY, maxTileX, maxTileY, worldTilesPerPixel, biomeCounts};
    }
}



