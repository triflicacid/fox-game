import {BiomeTag} from "./generation/biome/biome";
import {FeatureTag} from "./generation/feature/feature-tag";
import {StructureLayer} from "./generation/structure/structure-manifest";
import {CollisionResponseKind} from "../geometry/collision-response";

/** The structure piece (if any) occupying a hovered tile - see {@link TileHoverInfo.structure}. */
export interface StructureHoverInfo {
    /** The piece's sprite type, e.g. `"tree.oak.log_round"`. */
    sprite: string;
    /** Which `Structure` produced this piece, e.g. `"tree"`/`"cactus"` - see {@link Structure.getStructureId}. */
    structureId: string;
    /** Whether this piece draws before or after entities - see {@link StructureManifestPiece.role}/`Structure`'s class doc. */
    layer: StructureLayer;
    /** How an entity overlapping this piece's tile reacts, or `undefined` if it isn't collidable - see {@link StructurePieceInstance.collision}. */
    collision: Exclude<CollisionResponseKind, "none"> | undefined;
}

/**
 * Everything the debug hover tooltip (see `HoverTooltip`) shows about a
 * hovered tile - gathered by `World.getTileHoverInfo`.
 */
export interface TileHoverInfo {
    tileX: number;
    tileY: number;
    /** The tile's ground sprite, e.g. `"grass2"` - or, for an animated tile, its currently-showing frame, e.g. `"water.dark.2"` - see `Tile.getDisplayGroundType`. */
    groundType: string;
    biomeTag: BiomeTag;
    featureTag: FeatureTag;
    /** How an entity standing on this tile reacts, or `undefined` if it isn't collidable - see {@link Tile.getCollision}. */
    collision: Exclude<CollisionResponseKind, "none"> | undefined;
    /** The foreground/background structure piece occupying this tile, if any. */
    structure: StructureHoverInfo | undefined;
}

/**
 * Everything the debug hover tooltip shows about a hovered entity - gathered
 * by `World.getEntityHoverInfo`.
 */
export interface EntityHoverInfo {
    name: string;
    x: number;
    y: number;
    status: string;
    /** The entity's current velocity, or `undefined` if it's stationary (or not a `MovableEntity` at all). */
    velocity: {x: number; y: number} | undefined;
}
