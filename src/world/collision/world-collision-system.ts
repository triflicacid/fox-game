import type {ReadonlyEntityCollection} from "../../entities/entity-collection";
import {MovableEntity} from "../../entities/movable-entity";
import {CollisionResponseKind} from "../../geometry/collision-response";
import {ConvexPolygon, convexPolygonsIntersect, polygonBoundingRect, rectPolygon} from "../../geometry/convex-polygon";
import {Vector2d} from "../../geometry/vector2d";
import type {BackgroundTileType} from "../../sprites/background-tile-sprite-sheet";
import type {SpriteFrame} from "../../sprites/sprite";
import type {Chunk} from "../chunks/chunk";
import {CHUNK_SIZE} from "../chunks/chunk-size";
import {pixelRectToTileRange, type TileRange} from "../coordinates/world-grid-math";
import type {Structure} from "../generation/structure/structure";
import type {Tile, TileCollision} from "../tiles/tile";
import type {ReadyWorldGrid} from "../tiles/world-grid-view";
import {applyCollisionResponse, CollisionContext} from "./collision";
import type {StructureResolver} from "./structure-resolver";

/** Most recent collision pair, for the debug HUD indicator. */
export interface WorldCollisionDebugState {
    readonly entityLabel: string;
    readonly obstacleLabel: string;
}

/**
 * What one obstacle test did:-
 * `clear`: nothing overlapped.
 * `pushed`: an entity was pushed out of an overlap
 * `handled`: a structure took the collision over itself and the sweep must leave the
 * entity wherever that put it.
 */
type SweepOutcome = "clear" | "pushed" | "handled";

/**
 * How many times one tick re-sweeps an entity's surroundings after pushing it out of something.
 * 2 passes cover the common case - a push out of one obstacle sliding the hull into a neighbour.
 * The cap stops a hull wedged in a concave corner from ping-ponging forever.
 */
const MAX_PUSH_PASSES = 4;

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
     * The inclusive tile range `polygon`'s bounding rect spans: the broad
     * phase for callers that then test tiles against the polygon itself.
     */
    private polygonTileRange(polygon: ConvexPolygon): TileRange {
        const rect = polygonBoundingRect(polygon);
        return pixelRectToTileRange(rect.x, rect.y, rect.w, rect.h, this.tileSize);
    }

    /**
     * Whether every chunk overlapped by a `frame`-sized rectangle at `position`
     * is both loaded and satisfies `predicate`. Deliberately the drawn sprite
     * rather than its collision hull: no part of an entity may hang over
     * ground that doesn't exist yet.
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
        this.constrainEntities(previousPositions, (entity, position) => this.isPositionOnValidGround(position, entity.getCurrentFrame(), predicate));
    }

    /**
     * The obstacle `tile` presents to `entity`, if any: its own authored
     * collision, or - for water `entity` can't enter - the whole tile square,
     * since a water ground type carries no bounds of its own.
     */
    private tileObstacle(entity: MovableEntity, tile: Tile, tileX: number, tileY: number): TileCollision | undefined {
        const collision = tile.getCollision(tileX, tileY, this.tileSize);
        if (collision || !this.isWaterOffLimits(entity, tile.groundType)) {
            return collision;
        }
        return {
            polygon: rectPolygon(tileX * this.tileSize, tileY * this.tileSize, this.tileSize, this.tileSize),
            response: "solid",
        };
    }

    /**
     * Whether `groundType` is water `entity` isn't currently allowed onto, and
     * so should be blocked by {@link tileObstacle} as if it were solid ground.
     * Every entity is kept off water for now, even a `SwimmableEntity` one -
     * swim movement itself isn't implemented yet.
     *
     * TODO: once swim movement exists, let a `SwimmableEntity` (`entity.canSwim()`) onto water instead of blocking it here too.
     */
    private isWaterOffLimits(entity: MovableEntity, groundType: BackgroundTileType): boolean {
        if (!groundType.startsWith("water.")) {
            return false;
        }
        if (entity.canSwim()) {
            console.log(`${entity.getDisplayName()} can swim but water is still blocked pending swim movement support`);
        }
        return true;
    }

    /**
     * Slides or pushes back every {@link MovableEntity} that ended the tick
     * somewhere `isValid` rejects: first tries sliding along just the axis
     * that stayed valid, then falls all the way back to last tick's position.
     */
    private constrainEntities(
        previousPositions: ReadonlyMap<MovableEntity, Vector2d>,
        isValid: (entity: MovableEntity, position: Vector2d) => boolean,
    ): void {
        for (const entity of this.entities.getEntities()) {
            if (!(entity instanceof MovableEntity)) {
                continue;
            }
            const previous = previousPositions.get(entity);
            if (!previous) {
                continue;
            }

            const current = entity.getPosition();
            if (isValid(entity, current)) {
                continue;
            }

            const slideX = new Vector2d(current.x, previous.y);
            const slideY = new Vector2d(previous.x, current.y);
            if (isValid(entity, slideX)) {
                entity.teleportTo(slideX);
            } else if (isValid(entity, slideY)) {
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

    /**
     * Pushes `entity` out of everything its collision hull overlaps, re-sweeping
     * until a pass finds nothing left (or {@link MAX_PUSH_PASSES} runs out),
     * since one push can bring another obstacle into contact.
     */
    private resolveEntityCollisions(entity: MovableEntity, previousPosition: Vector2d): void {
        for (let pass = 0; pass < MAX_PUSH_PASSES; pass++) {
            if (this.resolveOverlappingObstacles(entity, previousPosition) !== "pushed") {
                return;
            }
        }
    }

    /** Pushes `entity` out of every tile and structure piece its hull currently overlaps, one sweep of the tiles it spans. */
    private resolveOverlappingObstacles(entity: MovableEntity, previousPosition: Vector2d): SweepOutcome {
        const {startTileX, startTileY, endTileX, endTileY} = this.polygonTileRange(entity.getCollisionPolygon());
        let outcome: SweepOutcome = "clear";

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.worldGrid.getReadyTile(tileX, tileY);
                const tileCollision = tile && this.tileObstacle(entity, tile, tileX, tileY);
                if (tile && tileCollision) {
                    const result = this.resolveObstacleCollision(entity, previousPosition, tileCollision.polygon, tileCollision.response, "tile", tile.groundType, tileX, tileY, undefined);
                    if (result === "handled") {
                        return "handled"; // a handler took the collision over: leave the entity where it put it
                    }
                    if (result === "pushed") {
                        outcome = "pushed";
                    }
                }

                const piece = this.worldGrid.getReadyStructurePieceAt(tileX, tileY);
                if (piece && piece.collision !== "none") {
                    const piecePolygon = this.structureResolver.structurePiecePolygon(piece, tileX, tileY, this.tileSize);
                    const structure = this.structureResolver.findStructure(piece.structureId);
                    const result = this.resolveObstacleCollision(entity, previousPosition, piecePolygon, piece.collision, "structure", piece.sprites.join(", "), tileX, tileY, structure);
                    if (result === "handled") {
                        return "handled";
                    }
                    if (result === "pushed") {
                        outcome = "pushed";
                    }
                }
            }
        }
        return outcome;
    }

    /**
     * Tests `entity`'s current polygon against `obstaclePolygon` and on overlap
     * gives `structure` first refusal, then applies `response` generically.
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
    ): SweepOutcome {
        if (!convexPolygonsIntersect(entity.getCollisionPolygon(), obstaclePolygon)) {
            return "clear";
        }
        this.lastCollision = {
            entityLabel: entity.getDisplayName(),
            obstacleLabel: `${obstacleKind} "${obstacleName}" (${tileX}, ${tileY})`,
        };
        const context: CollisionContext = {entity, previousPosition, obstaclePolygon, obstacleKind, obstacleName, tileX, tileY};
        if (structure?.handleCollision && !structure.handleCollision(context)) {
            return "handled";
        }
        applyCollisionResponse(response, context);
        return "pushed";
    }
}
