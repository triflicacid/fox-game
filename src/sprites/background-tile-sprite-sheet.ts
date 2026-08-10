import descriptorJson from "../../static/background-tile-sprites.json";
import {SpriteSheetDescriptor, SpriteTileDescriptor} from "./sprite-sheet-descriptor";
import {StaticSpriteSheet} from "./static-sprite-sheet";

/** Every ground tile type in `static/background-tile-sprites.png`/`.json`. */
export type BackgroundTileType = "plains.grass1" | "plains.grass2" | "plains.grass3" | "plains.dirt" | "plains.gravel" | "water.light" | "water.dark"
    | "desert.sand1" | "desert.sand2" | "desert.sand3" | "water.oasis.light" | "water.oasis.dark" | "forest1" | "forest2" | "forest3"
    | "tundra.barren.light" | "tundra.barren.medium" | "tundra.barren.dark"
    | "tundra.icy.light" | "tundra.icy.dark";

const descriptor = descriptorJson as SpriteSheetDescriptor<BackgroundTileType, SpriteTileDescriptor<BackgroundTileType>>;

/**
 * The ground-tile sheet at `./static/background-tile-sprites.png`.
 */
export class BackgroundTileSpriteSheet extends StaticSpriteSheet<BackgroundTileType> {
    public constructor() {
        super("./static/background-tile-sprites.png", descriptor);
    }
}
