import descriptorJson from "../../static/structure-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every log/leaf tile type `TreeStructure` uses, out of the full `static/structure-sprites.png`/`.json` set. */
export type TreeSpriteType = "tree.oak.log_square" | "tree.oak.log_round" | "tree.oak.leaves"
    | "tree.birch.log_square" | "tree.birch.log_round" | "tree.birch.leaves";

/** Every dead-tree tile type `SkeletalTreeStructure` uses - single-tile, standalone sprites, unlike `TreeSpriteType`'s trunk/leaf pieces. Numbered rather than descriptively named, since they're just interchangeable variants of the same thing. */
export type SkeletalTreeSpriteType = "skeletal_tree.1" | "skeletal_tree.2" | "skeletal_tree.3";

/** Corner roles a 2x2 "large" boulder's pieces resolve to. */
type BoulderCorner = "nw" | "ne" | "sw" | "se";

/** Direction roles a 3x3 "huge" boulder's pieces resolve to - the 4 corners plus the 4 edge midpoints around its own `center` piece. */
type BoulderDirection = BoulderCorner | "n" | "e" | "s" | "w" | "center";

/** Every boulder tile type `BoulderStructure` uses. */
export type BoulderSpriteType =
    | "boulder.small.solo" | "boulder.small.pair" | "boulder.small.cluster"
    | `boulder.large.${BoulderCorner}` | `boulder.large.snow.${BoulderCorner}`
    | `boulder.huge.${BoulderDirection}` | `boulder.huge.snow.${BoulderDirection}`;

/** Every sprite type this sheet exposes, across every structure that draws from it. */
export type StructureSpriteType = TreeSpriteType | SkeletalTreeSpriteType | BoulderSpriteType;

const descriptor = descriptorJson as SpriteSheetDescriptor<StructureSpriteType, SpriteTileDescriptor<StructureSpriteType>>;

/**
 * Structure tiles at `./static/structure-sprites.png`: static (non-animated)
 * sprites for world structures (e.g. trees, dead trees, boulders), one tile
 * in size each. `StructureSpriteType` only exposes the subset this codebase
 * uses so far.
 */
export class StructureSpriteSheet extends StaticSpriteSheet<StructureSpriteType> {
    public constructor() {
        super("./static/structure-sprites.png", descriptor);
    }
}
