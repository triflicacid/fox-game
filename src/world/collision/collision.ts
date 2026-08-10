import {MovableEntity} from "../../entities/movable-entity";
import {Vector2d} from "../../geometry/vector2d";
import {ConvexPolygon, minimumTranslationVector} from "../../geometry/convex-polygon";
import {CollisionResponseKind} from "../../geometry/collision-response";

/**
 * Extra push past the exact minimum-translation-vector distance
 * {@link resolveSolid} resolves a collision to, so the resolved position has
 * a genuine (if imperceptible) gap from the obstacle rather than resting
 * exactly on its boundary. Without this, the next tick's collision check
 * would find that same resting contact "colliding" again (touching counts
 * as overlapping - see `convexPolygonsIntersect`'s doc in `convex-polygon.ts`)
 * and redo the same no-op push every tick.
 */
const SEPARATION_MARGIN_PX = 0.05;

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
 * Blocks movement - a simple {@link https://en.wikipedia.org/wiki/Collision_response | collision response}:
 * pushes `context.entity` directly out of `context.obstaclePolygon` by the
 * minimum translation vector (see {@link minimumTranslationVector}), plus
 * {@link SEPARATION_MARGIN_PX}.
 *
 * Deliberately ignores `context.previousPosition`: an earlier version tried
 * building "slide" candidates by mixing the entity's previous and current
 * position per axis, falling back to `previousPosition` outright if neither
 * cleared the obstacle. That broke as soon as `previousPosition` was itself
 * already resting against an obstacle (e.g. one "foot" of the hitbox
 * grazing a wall) - turning to move along a fresh single axis made both
 * slide candidates collapse onto already-known-colliding positions (one
 * literally identical to the just-detected collision, the other identical
 * to the already-touching `previousPosition`), so the entity froze
 * entirely instead of just being blocked along the one axis that was
 * actually blocked. Computing the push directly from the current overlap,
 * with no reference to any remembered position, sidesteps that whole
 * failure mode.
 *
 * @param context - See {@link CollisionContext}.
 */
function resolveSolid({entity, obstaclePolygon}: CollisionContext): void {
    const push = minimumTranslationVector(entity.getCollisionPolygon(), obstaclePolygon);
    if (!push) {
        return; // Already resolved (e.g. by an earlier obstacle this same sweep), or merely touching - nothing to push out of.
    }

    const depth = Math.hypot(push.x, push.y);
    const withMargin = push.scale((depth + SEPARATION_MARGIN_PX) / depth);
    entity.teleportTo(entity.getPosition().add(withMargin));
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
