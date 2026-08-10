import descriptorJson from "../../static/desert-structures.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./static-sprite-sheet";

/** Every cactus tile type in `static/desert-structures.png`/`.json` - the only structure family the desert biome has. */
export type DesertStructureSpriteType =
    | "cactus.saguaro.no_arm" | "cactus.saguaro.arm_left" | "cactus.saguaro.arm_right" | "cactus.saguaro.both_arms"
    | "cactus.saguaro.no_arm_flower" | "cactus.saguaro.arm_left_flower" | "cactus.saguaro.arm_right_flower" | "cactus.saguaro.both_arms_flower"
    | "cactus.barrel.plain" | "cactus.barrel.flower_pink" | "cactus.barrel.flower_yellow" | "cactus.barrel.flower_white";

const descriptor = descriptorJson as SpriteSheetDescriptor<DesertStructureSpriteType, SpriteTileDescriptor<DesertStructureSpriteType>>;

/**
 * Desert structure tiles at `./static/desert-structures.png`: static
 * (non-animated) sub-tile sprites, one tile in size each - currently just
 * `CactusStructure`'s cacti.
 */
export class DesertStructureSpriteSheet extends StaticSpriteSheet<DesertStructureSpriteType> {
    public constructor() {
        super("./static/desert-structures.png", descriptor);
    }
}
