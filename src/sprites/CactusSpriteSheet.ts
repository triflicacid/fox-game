import descriptorJson from "../../static/cactus-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every cactus tile type in `static/cactus-sprites.png`/`.json`. */
export type CactusSpriteType =
    | "saguaroNoArm" | "saguaroArmLeft" | "saguaroArmRight" | "saguaroBothArms"
    | "saguaroNoArmFlower" | "saguaroArmLeftFlower" | "saguaroArmRightFlower" | "saguaroBothArmsFlower"
    | "barrelPlain" | "barrelFlowerPink" | "barrelFlowerYellow" | "barrelFlowerWhite";

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
