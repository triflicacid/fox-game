import descriptorJson from "../../static/animated-background-tile-sprites.json";
import {SpriteAnimatedTileDescriptor, SpriteSheetDescriptor} from "./sprite-sheet-descriptor";
import {AnimatedTileSpriteSheet} from "./animated-tile-sprite-sheet";

/** Every animated background-tile type in `static/animated-background-tile-sprites.png`/`.json`. */
export type AnimatedBackgroundTileType = "water.light" | "water.dark" | "water.oasis.light" | "water.oasis.dark";

const descriptor = descriptorJson as SpriteSheetDescriptor<AnimatedBackgroundTileType, SpriteAnimatedTileDescriptor<AnimatedBackgroundTileType>>;

/**
 * The animated background-tile sheet at `./static/animated-background-tile-sprites.png`.
 */
export class AnimatedBackgroundTileSpriteSheet extends AnimatedTileSpriteSheet<AnimatedBackgroundTileType> {
    public constructor() {
        super("./static/animated-background-tile-sprites.png", descriptor);
    }
}
