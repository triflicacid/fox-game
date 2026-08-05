import descriptorJson from "../../static/tree-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every log/leaf tile type in `static/tree-sprites.png`/`.json`. */
export type TreeSpriteType = "tree.oak.log_square" | "tree.oak.log_round" | "tree.oak.leaves"
    | "tree.birch.log_square" | "tree.birch.log_round" | "tree.birch.leaves";

const descriptor = descriptorJson as SpriteSheetDescriptor<TreeSpriteType, SpriteTileDescriptor<TreeSpriteType>>;

/**
 * Tree structure tiles at `./static/tree-sprites.png`: static (non-animated)
 * log/leaf sprites, one tile in size each.
 */
export class TreeSpriteSheet extends StaticSpriteSheet<TreeSpriteType> {
    public constructor() {
        super("./static/tree-sprites.png", descriptor);
    }
}
