import descriptorJson from "../../static/forest-structures.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./static-sprite-sheet";

/** Every log/leaf tile type `TreeStructure` uses, out of the full `static/forest-structures.png`/`.json` set - the only structure family the forest biome has. */
export type ForestStructureSpriteType = "tree.oak.log_square" | "tree.oak.log_round" | "tree.oak.leaves"
    | "tree.birch.log_square" | "tree.birch.log_round" | "tree.birch.leaves";

const descriptor = descriptorJson as SpriteSheetDescriptor<ForestStructureSpriteType, SpriteTileDescriptor<ForestStructureSpriteType>>;

/**
 * Forest structure tiles at `./static/forest-structures.png`.
 */
export class ForestStructureSpriteSheet extends StaticSpriteSheet<ForestStructureSpriteType> {
    public constructor() {
        super("./static/forest-structures.png", descriptor);
    }
}
