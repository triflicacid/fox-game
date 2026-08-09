import descriptorJson from "../../static/tundra-structures.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every dead-tree tile type `SkeletalTreeStructure` uses. */
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

/** Every sprite type this sheet exposes, across both structures the tundra biome has (dead trees, boulders). */
export type TundraStructureSpriteType = SkeletalTreeSpriteType | BoulderSpriteType;

const descriptor = descriptorJson as SpriteSheetDescriptor<TundraStructureSpriteType, SpriteTileDescriptor<TundraStructureSpriteType>>;

/**
 * Tundra structure tiles at `./static/tundra-structures.png`.
 */
export class TundraStructureSpriteSheet extends StaticSpriteSheet<TundraStructureSpriteType> {
    public constructor() {
        super("./static/tundra-structures.png", descriptor);
    }
}
