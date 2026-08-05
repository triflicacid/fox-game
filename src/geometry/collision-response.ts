/**
 * How a collidable thing (a tile, a structure piece, ...) reacts when an
 * entity's collision polygon overlaps it:
 *
 * - `"none"`: doesn't react at all - equivalent to not being collidable.
 *   Exists as an explicit value (rather than just omitting collision data)
 *   so a tile/piece can carry a hitbox for other purposes without it also
 *   blocking movement.
 * - `"solid"`: blocks movement - see `world/collision.ts`'s handler.
 */
export type CollisionResponseKind = "none" | "solid";
