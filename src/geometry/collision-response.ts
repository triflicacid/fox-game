/**
 * How a collidable thing reacts when an entity's collision polygon overlaps it:
 * - `"none"`: doesn't react at all.
 * - `"solid"`: blocks movement - see `world/collision.ts`'s handler.
 */
export type CollisionResponseKind = "none" | "solid";
