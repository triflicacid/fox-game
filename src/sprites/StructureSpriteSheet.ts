import descriptorJson from "../../static/structure-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every log/leaf tile type this sheet exposes, out of the full `static/structure-sprites.png`/`.json` set. */
export type TreeSpriteType = "tree.oak.log_square" | "tree.oak.log_round" | "tree.oak.leaves"
    | "tree.birch.log_square" | "tree.birch.log_round" | "tree.birch.leaves";

const descriptor = descriptorJson as SpriteSheetDescriptor<TreeSpriteType, SpriteTileDescriptor<TreeSpriteType>>;

/**
 * Structure tiles at `./static/structure-sprites.png`: static (non-animated)
 * sprites for world structures (e.g. trees, boulders), one tile in size
 * each. `TreeSpriteType` only exposes the tree subset this codebase uses so
 * far.
 */
export class StructureSpriteSheet extends StaticSpriteSheet<TreeSpriteType> {
    public constructor() {
        super("./static/structure-sprites.png", descriptor);
    }
}
