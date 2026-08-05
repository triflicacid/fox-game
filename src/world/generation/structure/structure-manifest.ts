import {CollisionResponseKind} from "../../../geometry/collision-response";

/** Which chunk-render layer a structure piece belongs to. */
export type StructureLayer = "background" | "foreground";

/** One tile a structure shape occupies, relative to its anchor tile. */
export interface StructureManifestPiece {
    /** Offset X from the anchor, in tiles. */
    readonly x: number;
    /** Offset Y from the anchor, in tiles. */
    readonly y: number;
    /** Free-form per-structure-type label (e.g. `"trunk"`/`"leaf"`) a `Structure` subclass maps to a concrete sprite. */
    readonly role: string;
    /** Which render layer this piece belongs to. */
    readonly layer: StructureLayer;
    /** How this piece reacts to an overlapping entity - see `world/collision.ts`'s handler registry. Defaults to `"none"` when omitted. */
    readonly collision?: CollisionResponseKind;
}

/** One named layout a structure family can take. */
export interface StructureShape {
    /** Stable id, for debugging/authoring - not otherwise used at runtime. */
    readonly id: string;
    readonly pieces: readonly StructureManifestPiece[];
}

/** Every shape available per named family (e.g. `"oak"`/`"birch"`), loaded from a JSON manifest file. */
export type StructureManifest = Readonly<Record<string, readonly StructureShape[]>>;

/**
 * Deterministically picks one of `shapes`, indexed by `unitInterval`.
 *
 * @param shapes - A family's available shapes - must be non-empty.
 * @param unitInterval - A value in `[0, 1)`, typically a hash roll.
 * @returns The picked shape.
 */
export function pickShape(shapes: readonly StructureShape[], unitInterval: number): StructureShape {
    const index = Math.min(shapes.length - 1, Math.floor(unitInterval * shapes.length));
    return shapes[index];
}
