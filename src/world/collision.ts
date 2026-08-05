import {MovableEntity} from "../entities/movable-entity";
import {Vector2d} from "../geometry/vector2d";
import {ConvexPolygon, convexPolygonsIntersect} from "../geometry/convex-polygon";
import {CollisionResponseKind} from "../geometry/collision-response";

/**
 * Everything a {@link CollisionResponseHandler} needs to react to one
 * entity/obstacle overlap - also, in its entirety, what {@link applyCollisionResponse}
 * logs, so a new field added here shows up in that log for free.
 */
export interface CollisionContext {
    /** The entity that walked into the obstacle. */
    readonly entity: MovableEntity;
    /** `entity`'s position before this tick's movement. */
    readonly previousPosition: Vector2d;
    /** The obstacle's collision polygon, in world pixels. */
    readonly obstaclePolygon: ConvexPolygon;
    /** What kind of obstacle this is (e.g. `"tile"`/`"structure"`). */
    readonly obstacleKind: string;
    /** The obstacle's own name (e.g. a ground type or structure sprite). */
    readonly obstacleName: string;
    /** The obstacle's tile X, in tiles from the world origin. */
    readonly tileX: number;
    /** The obstacle's tile Y, in tiles from the world origin. */
    readonly tileY: number;
}

/** Reacts to one entity/obstacle overlap, however its {@link CollisionResponseKind} wants to (e.g. by repositioning `context.entity`). */
export type CollisionResponseHandler = (context: CollisionContext) => void;

/**
 * Blocks movement: same "slide along the axis that's still clear, else
 * revert" idea as {@link World.constrainEntitiesToChunks}'s chunk-boundary
 * constraint, just tested against one obstacle's own polygon (via
 * {@link MovableEntity.collisionPolygonAt}) instead of a chunk predicate.
 *
 * @param context - See {@link CollisionContext}.
 */
function resolveSolid({entity, previousPosition, obstaclePolygon}: CollisionContext): void {
    const current = entity.getPosition();
    const slideX = new Vector2d(current.x, previousPosition.y);
    const slideY = new Vector2d(previousPosition.x, current.y);

    if (!convexPolygonsIntersect(entity.collisionPolygonAt(slideX), obstaclePolygon)) {
        entity.teleportTo(slideX);
    } else if (!convexPolygonsIntersect(entity.collisionPolygonAt(slideY), obstaclePolygon)) {
        entity.teleportTo(slideY);
    } else {
        entity.teleportTo(previousPosition);
    }
}

/**
 * Every {@link CollisionResponseKind} handler, keyed by kind - `"none"` is
 * excluded, since callers are expected to skip dispatching for it entirely
 * (see {@link World.handleEntityCollisions}) rather than reacting to it.
 * Adding a new kind (e.g. `"bouncy"`) means adding its value to
 * {@link CollisionResponseKind} and a handler function here - nothing else
 * in the collision pipeline needs to change.
 */
const RESPONSE_HANDLERS: Record<Exclude<CollisionResponseKind, "none">, CollisionResponseHandler> = {
    solid: resolveSolid,
};

/**
 * Logs `context` - the single, generic log point for every collision,
 * whatever `kind` turns out to be, so a new response kind doesn't need to
 * remember to log itself - then runs the handler registered for `kind` (see
 * {@link RESPONSE_HANDLERS}).
 *
 * @param kind - Which response to apply - must not be `"none"`.
 * @param context - See {@link CollisionContext}.
 */
export function applyCollisionResponse(kind: Exclude<CollisionResponseKind, "none">, context: CollisionContext): void {
    console.log("Collision:", context);
    RESPONSE_HANDLERS[kind](context);
}
