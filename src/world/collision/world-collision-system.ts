import type {ReadonlyEntityCollection} from "../../entities/entity-collection";
import {MovableEntity} from "../../entities/movable-entity";
import {CollisionResponseKind} from "../../geometry/collision-response";
import {ConvexPolygon, convexPolygonsIntersect} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import type {SpriteFrame} from "../../sprites/sprite";
import type {Chunk} from "../chunks/chunk";
import {CHUNK_SIZE} from "../chunks/chunk-size";
import {pixelRectToTileRange} from "../coordinates/world-grid-math";
import type {Structure} from "../generation/structure/structure";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import {applyCollisionResponse, CollisionContext} from "./collision";
import type {StructureResolver} from "./structure-resolver";

/** Most recent collision pair, for the debug HUD indicator. */
export interface WorldCollisionDebugState {
    readonly entityLabel: string;
    readonly obstacleLabel: string;
}

// Note: only supports `MovableEntity` for colisison etc. Will need to expand later.

/** Constrains entities to generated ground, then sweeps them against tile/structure collisions. */
export class WorldCollisionSystem {
    /** Most recent handled collision. Stays set until the colliding entity moves again. */
    private lastCollision: WorldCollisionDebugState | undefined;

    /**
     * Whether entities may move onto a chunk that hasn't finished generating
     * yet. `false` by default.
     */
    private canMoveOntoGeneratingChunks = false;

    /**
     * @param worldGrid - Ready-only grid reads; never triggers generation.
     * @param entities - Live entity set to constrain and collide.
     * @param structureResolver - Resolves a structure piece's collision hull and originating definition.
     * @param tileSize - Width/height a tile renders at, in canvas pixels.
     */
    public constructor(
        private readonly worldGrid: ReadyWorldGrid,
        private readonly entities: ReadonlyEntityCollection,
        private readonly structureResolver: StructureResolver,
        private readonly tileSize: number,
    ) {}

    /** Whether entities may currently move onto a still-generating chunk. */
    public getCanMoveOntoGeneratingChunks(): boolean {
        return this.canMoveOntoGeneratingChunks;
    }

    /** Enables or disables movement onto still-generating chunks. */
    public setCanMoveOntoGeneratingChunks(canMove: boolean): void {
        this.canMoveOntoGeneratingChunks = canMove;
    }

    /** The most recently handled collision, or `undefined` if none is currently tracked. */
    public getDebugState(): WorldCollisionDebugState | undefined {
        return this.lastCollision;
    }

    /** Clears tracked collision state, e.g. during world disposal. */
    public clear(): void {
        this.lastCollision = undefined;
    }

    /**
     * Constrains every entity to generated ground - or, while generation is
     * disabled, to any loaded ground - then sweeps for tile/structure collisions.
     *
     * @param previousPositions - Each movable entity's position before this tick's update.
     * @param generationEnabled - Whether chunk generation is currently enabled.
     */
    public update(previousPositions: ReadonlyMap<MovableEntity, Vector2d>, generationEnabled: boolean): void {
        if (!generationEnabled) {
            this.constrainEntitiesToChunks(previousPositions, () => true);
        } else if (!this.canMoveOntoGeneratingChunks) {
            this.constrainEntitiesToChunks(previousPositions, (chunk) => chunk.isReady());
        }
        this.resolveActorCollisions(previousPositions);
    }

    /**
     * Whether every chunk overlapped by a `frame`-sized rectangle at `position`
     * is both loaded and satisfies `predicate`.
     */
    private isPositionOnValidGround(position: Vector2d, frame: SpriteFrame, predicate: (chunk: Chunk) => boolean): boolean {
        const chunkPixelSize = CHUNK_SIZE * this.tileSize;
        const startChunkX = Math.floor((position.x - frame.w / 2) / chunkPixelSize);
        const startChunkY = Math.floor((position.y - frame.h / 2) / chunkPixelSize);
        const endChunkX = Math.floor((position.x + frame.w / 2 - 1) / chunkPixelSize);
        const endChunkY = Math.floor((position.y + frame.h / 2 - 1) / chunkPixelSize);

        for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
            for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
                const chunk = this.worldGrid.getLoadedChunk(chunkX, chunkY);
                if (!chunk || !predicate(chunk)) {
                    return false;
                }
            }
        }
        return true;
    }

    /** Slides or pushes back every {@link MovableEntity} that ended the tick on invalid ground. */
    private constrainEntitiesToChunks(previousPositions: ReadonlyMap<MovableEntity, Vector2d>, predicate: (chunk: Chunk) => boolean): void {
        for (const entity of this.entities.getEntities()) {
            if (!(entity instanceof MovableEntity)) {
                continue;
            }
            const previous = previousPositions.get(entity);
            if (!previous) {
                continue;
            }

            const current = entity.getPosition();
            const frame = entity.getCurrentFrame();
            if (this.isPositionOnValidGround(current, frame, predicate)) {
                continue;
            }

            const slideX = new Vector2d(current.x, previous.y);
            const slideY = new Vector2d(previous.x, current.y);
            if (this.isPositionOnValidGround(slideX, frame, predicate)) {
                entity.teleportTo(slideX);
            } else if (this.isPositionOnValidGround(slideY, frame, predicate)) {
                entity.teleportTo(slideY);
            } else {
                entity.teleportTo(previous);
            }
        }
    }

    /** Sweeps each movable entity against collidable tiles and structure pieces. */
    private resolveActorCollisions(previousPositions: ReadonlyMap<MovableEntity, Vector2d>): void {
        for (const entity of this.entities.getEntities()) {
            if (!(entity instanceof MovableEntity)) {
                continue;
            }
            const previousPosition = previousPositions.get(entity);
            if (!previousPosition) {
                continue;
            }
            if (entity.isMoving()) {
                this.lastCollision = undefined;
            }
            this.resolveEntityCollisions(entity, previousPosition);
        }
    }

    /** Tests `entity` against every tile and structure piece in its bounding rect, stopping at the first handled collision. */
    private resolveEntityCollisions(entity: MovableEntity, previousPosition: Vector2d): void {
        const rect = entity.getBoundingRect();
        const {startTileX, startTileY, endTileX, endTileY} = pixelRectToTileRange(rect.x, rect.y, rect.w, rect.h, this.tileSize);

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.worldGrid.getReadyTile(tileX, tileY);
                const tileCollision = tile?.getCollision(tileX, tileY, this.tileSize);
                if (tile && tileCollision) {
                    if (this.resolveObstacleCollision(entity, previousPosition, tileCollision.polygon, tileCollision.response, "tile", tile.groundType, tileX, tileY, undefined)) {
                        return;
                    }
                }

                const piece = this.worldGrid.getReadyStructurePieceAt(tileX, tileY);
                if (piece && piece.collision !== "none") {
                    const piecePolygon = this.structureResolver.structurePiecePolygon(piece, tileX, tileY, this.tileSize);
                    const structure = this.structureResolver.findStructure(piece.structureId);
                    if (this.resolveObstacleCollision(entity, previousPosition, piecePolygon, piece.collision, "structure", piece.sprites.join(", "), tileX, tileY, structure)) {
                        return;
                    }
                }
            }
        }
    }

    /**
     * Tests `entity`'s current polygon against `obstaclePolygon` and on overlap
     * gives `structure` first refusal, then applies `response` generically.
     * Returns `true` if a collision was found and handled.
     */
    private resolveObstacleCollision(
        entity: MovableEntity,
        previousPosition: Vector2d,
        obstaclePolygon: ConvexPolygon,
        response: Exclude<CollisionResponseKind, "none">,
        obstacleKind: string,
        obstacleName: string,
        tileX: number,
        tileY: number,
        structure: Structure | undefined,
    ): boolean {
        if (!convexPolygonsIntersect(entity.getCollisionPolygon(), obstaclePolygon)) {
            return false;
        }
        this.lastCollision = {
            entityLabel: entity.getDisplayName(),
            obstacleLabel: `${obstacleKind} "${obstacleName}" (${tileX}, ${tileY})`,
        };
        const context: CollisionContext = {entity, previousPosition, obstaclePolygon, obstacleKind, obstacleName, tileX, tileY};
        if (structure?.handleCollision && !structure.handleCollision(context)) {
            return true;
        }
        applyCollisionResponse(response, context);
        return true;
    }
}
