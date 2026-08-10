import {MovableEntity} from "../../entities/movable-entity";
import type {SpriteFrame} from "../../sprites/sprite";
import {Vector2d} from "../../geometry/vector2d";
import type {DrawableChunk} from "../chunks/chunk";
import type {Tile} from "../tiles/tile";

/** A minimal canvas context that records operations used by World tests. */
export function createRecordingContext(events: string[], width = 16, height = 16): CanvasRenderingContext2D {
    return {
        canvas: {width, height},
        save: () => events.push("context:save"),
        restore: () => events.push("context:restore"),
        scale: () => events.push("context:scale"),
        fillRect: () => events.push("context:fillRect"),
        drawImage: () => events.push("entity:draw"),
        translate: () => events.push("context:translate"),
        rotate: () => events.push("context:rotate"),
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
        strokeRect: () => undefined,
        measureText: () => ({width: 0}),
        createLinearGradient: () => ({addColorStop: () => undefined}),
        fillText: () => undefined,
    } as unknown as CanvasRenderingContext2D;
}

/** Options controlling one fake runtime chunk. */
export interface TestChunkOptions {
    readonly ready?: boolean;
    readonly events?: string[];
}

/** Creates the chunk surface exercised by World orchestration tests. */
export function createTestChunk(chunkX: number, chunkY: number, options: TestChunkOptions = {}): DrawableChunk {
    const {ready = false, events} = options;
    const biomeSummary = ready ? "plains" : "";
    return {
        getChunkX: () => chunkX,
        getChunkY: () => chunkY,
        getGenerationTimeMs: () => 0,
        getBiomeSummary: () => biomeSummary,
        isReady: () => ready,
        getTile: (): Tile => ({getCollision: () => undefined}) as unknown as Tile,
        getStructurePieceAt: () => undefined,
        draw: () => events?.push("chunk:draw"),
        drawProps: () => events?.push("chunk:props"),
        drawDebug: () => events?.push("chunk:debug"),
        drawNoiseOverlay: () => events?.push("chunk:noise"),
        getCacheState: () => "live",
    };
}

/** Options controlling a prototype-safe movable entity double. */
export interface TestMovableEntityOptions {
    readonly position?: Vector2d;
    readonly nextPosition?: Vector2d;
    readonly frameWidth?: number;
    readonly frameHeight?: number;
    readonly moving?: boolean;
    readonly bitmap?: ImageBitmap | null;
    readonly events?: string[];
}

/** Creates a MovableEntity instance without constructing browser sprite resources. */
export function createTestMovableEntity(options: TestMovableEntityOptions = {}): MovableEntity {
    let position = options.position ?? new Vector2d(8, 8);
    const frameWidth = options.frameWidth ?? 8;
    const frameHeight = options.frameHeight ?? 8;
    const frame: SpriteFrame = {
        x: 0,
        y: 0,
        w: frameWidth,
        h: frameHeight,
        frameIndex: 0,
        frameCount: 1,
        loops: true,
        bounds: {
            points: [
                new Vector2d(-frameWidth / 2, -frameHeight / 2),
                new Vector2d(frameWidth / 2, -frameHeight / 2),
                new Vector2d(frameWidth / 2, frameHeight / 2),
                new Vector2d(-frameWidth / 2, frameHeight / 2),
            ],
        },
    };
    const entity = Object.create(MovableEntity.prototype) as MovableEntity;
    Object.assign(entity, {
        effectDispatcher: {clear: () => undefined},
        update: () => {
            options.events?.push("entity:update");
            position = options.nextPosition ?? position;
        },
        getPosition: () => position,
        getCurrentFrame: () => frame,
        getBoundingRect: () => ({
            x: position.x - frameWidth / 2,
            y: position.y - frameHeight / 2,
            w: frameWidth,
            h: frameHeight,
        }),
        getCollisionPolygon: () => frame.bounds.points.map((point) => position.add(new Vector2d(point.x, point.y))),
        getCurrentBitmap: () => options.bitmap ?? null,
        getFacing: () => "south",
        getFacingVector: () => new Vector2d(0, 1),
        getVelocity: () => options.moving ? new Vector2d(1, 0) : Vector2d.ZERO,
        isMoving: () => options.moving ?? false,
        teleportTo: (next: Vector2d) => {
            position = next;
            options.events?.push(`entity:teleport:${next.x},${next.y}`);
        },
        getDisplayName: () => "test entity",
        getStatus: () => "test",
        getRegistryId: () => "test#0",
        drawDebugOverlay: () => options.events?.push("entity:debug"),
    });
    return entity;
}





