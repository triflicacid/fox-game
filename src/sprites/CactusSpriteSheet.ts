import descriptorJson from "../../static/cactus-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every cactus tile type in `static/cactus-sprites.png`/`.json`. */
export type CactusSpriteType =
    | "cactus:saguaro:no_arm" | "cactus:saguaro:arm_left" | "cactus:saguaro:arm_right" | "cactus:saguaro:both_arms"
    | "cactus:saguaro:no_arm_flower" | "cactus:saguaro:arm_left_flower" | "cactus:saguaro:arm_right_flower" | "cactus:saguaro:both_arms_flower"
    | "cactus:barrel:plain" | "cactus:barrel:flower_pink" | "cactus:barrel:flower_yellow" | "cactus:barrel:flower_white";

const descriptor = descriptorJson as SpriteSheetDescriptor<CactusSpriteType, SpriteTileDescriptor<CactusSpriteType>>;

/**
 * Cactus structure tiles at `./static/cactus-sprites.png`: static
 * (non-animated) sub-tile sprites, one tile in size each.
 */
export class CactusSpriteSheet extends StaticSpriteSheet<CactusSpriteType> {
    public constructor() {
        super("./static/cactus-sprites.png", descriptor);
    }
}
