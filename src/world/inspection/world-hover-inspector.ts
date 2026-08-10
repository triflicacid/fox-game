import {Entity} from "../../entities/entity";
import {MovableEntity} from "../../entities/movable-entity";
import {Minimap, type MinimapData} from "../../minimap/minimap";
import type {WorldGenerationView} from "../generation/world-generation-view";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import {type EntityHoverInfo, type MinimapHoverInfo, type TileHoverInfo} from "./hover-info";

/** Tracks minimap hover state and answers the three hover query types. */
export class WorldHoverInspector {
    private lastMinimapData: MinimapData | undefined;

    public constructor(
        private readonly tileSize: number,
        private readonly worldGrid: ReadyWorldGrid,
        private readonly generationView: WorldGenerationView,
        private readonly readEntities: () => readonly Entity[],
    ) {}

    /** Stores the minimap data drawn this frame so hover queries can reference it. */
    public setLastMinimapData(data: MinimapData | undefined): void {
        this.lastMinimapData = data;
    }

    /**
     * Returns hover data for a world tile position, or `undefined` when the
     * tile's chunk is not yet ready.
     */
    public getTileHoverInfo(tileX: number, tileY: number, animationElapsedMs: number): TileHoverInfo | undefined {
        const tile = this.worldGrid.getReadyTile(tileX, tileY);
        if (!tile) {
            return undefined;
        }
        const piece = this.worldGrid.getReadyStructurePieceAt(tileX, tileY);
        return {
            tileX,
            tileY,
            groundType: tile.getDisplayGroundType(animationElapsedMs),
            biomeTag: tile.biomeTag,
            featureTag: tile.featureTag,
            collision: tile.getCollision(tileX, tileY, this.tileSize)?.response,
            animated: tile.getAnimationInfo(),
            structure: piece && {
                sprites: piece.sprites,
                structureId: piece.structureId,
                layer: piece.layer,
                collision: piece.collision !== "none" ? piece.collision : undefined,
            },
        };
    }

    /**
     * Returns hover data for the minimap region under a screen point, or
     * `undefined` when the minimap was not drawn this frame or the point is
     * outside it.
     */
    public getMinimapHoverInfo(screenX: number, screenY: number, canvasWidth: number): MinimapHoverInfo | undefined {
        if (!this.lastMinimapData) {
            return undefined;
        }
        const tile = Minimap.screenToTile(screenX, screenY, canvasWidth, this.lastMinimapData);
        if (!tile) {
            return undefined;
        }
        const tileX = Math.floor(tile.x);
        const tileY = Math.floor(tile.y);
        return {tileX, tileY, biomeTag: this.generationView.resolveBiomeTagAt(tileX, tileY)};
    }

    /**
     * Returns hover data for the topmost entity whose drawn rectangle contains
     * `(worldX, worldY)`, or `undefined` when none does. Checked in reverse
     * draw order so the visually topmost entity is always tested first.
     */
    public getEntityHoverInfo(worldX: number, worldY: number): EntityHoverInfo | undefined {
        const entities = this.readEntities();
        for (let i = entities.length - 1; i >= 0; i--) {
            const entity = entities[i];
            const rect = entity.getBoundingRect();
            if (worldX < rect.x || worldX >= rect.x + rect.w || worldY < rect.y || worldY >= rect.y + rect.h) {
                continue;
            }
            const position = entity.getPosition();
            const velocity = entity instanceof MovableEntity && entity.isMoving() ? entity.getVelocity() : undefined;
            return {
                name: entity instanceof MovableEntity ? entity.getDisplayName() : entity.getRegistryId(),
                x: position.x,
                y: position.y,
                status: entity.getStatus(),
                velocity: velocity && {x: velocity.x, y: velocity.y},
            };
        }
        return undefined;
    }
}

