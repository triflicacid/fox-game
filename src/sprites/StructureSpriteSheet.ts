import descriptorJson from "../../static/structure-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every log/leaf tile type `TreeStructure` uses, out of the full `static/structure-sprites.png`/`.json` set. */
export type TreeSpriteType = "tree.oak.log_square" | "tree.oak.log_round" | "tree.oak.leaves"
    | "tree.birch.log_square" | "tree.birch.log_round" | "tree.birch.leaves";

/** Every dead-tree tile type `SkeletalTreeStructure` uses - single-tile, standalone sprites, unlike `TreeSpriteType`'s trunk/leaf pieces. Numbered rather than descriptively named, since they're just interchangeable variants of the same thing. */
export type SkeletalTreeSpriteType = "skeletal_tree.1" | "skeletal_tree.2" | "skeletal_tree.3";

/** Every sprite type this sheet exposes, across every structure that draws from it. */
export type StructureSpriteType = TreeSpriteType | SkeletalTreeSpriteType;

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
