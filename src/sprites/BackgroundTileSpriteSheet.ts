import descriptorJson from "../../static/background-tile-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./StaticSpriteSheet";

/** Every ground tile type in `static/background-tile-sprites.png`/`.json`. */
export type BackgroundTileType = "grass1" | "grass2" | "grass3" | "dirt" | "gravel" | "waterLight" | "waterDark";

const descriptor = descriptorJson as SpriteSheetDescriptor<BackgroundTileType, SpriteTileDescriptor<BackgroundTileType>>;

/**
 * The ground-tile sheet at `./static/background-tile-sprites.png`.
 */
export class BackgroundTileSpriteSheet extends StaticSpriteSheet<BackgroundTileType> {
    public constructor() {
        super("./static/background-tile-sprites.png", descriptor);
    }
}
