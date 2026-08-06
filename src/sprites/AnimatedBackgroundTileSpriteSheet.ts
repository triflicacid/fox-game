import descriptorJson from "../../static/animated-background-tile-sprites.json";
import {SpriteAnimatedTileDescriptor, SpriteSheetDescriptor} from "./sprite-sheet-descriptor";
import {AnimatedTileSpriteSheet} from "./AnimatedTileSpriteSheet";

/** Every animated water tile type in `static/animated-background-tile-sprites.png`/`.json`. */
export type WaterTileType = "water.light" | "water.dark" | "water.oasis.light" | "water.oasis.dark";

/** Every {@link WaterTileType}, for {@link isWaterTileType}. */
const WATER_TILE_TYPES: ReadonlySet<string> = new Set<WaterTileType>(["water.light", "water.dark", "water.oasis.light", "water.oasis.dark"]);

const descriptor = descriptorJson as SpriteSheetDescriptor<WaterTileType, SpriteAnimatedTileDescriptor<WaterTileType>>;

/**
 * The animated background-tile sheet at `./static/animated-background-tile-sprites.png`
 * - currently just water, but named for the mechanism (looping, non-entity
 * tile animation) rather than water specifically, since a future animated
 * tile type (e.g. lava) belongs here too. Split out from
 * {@link BackgroundTileSpriteSheet} because its entries loop through phases
 * on their own timer rather than being a single static image - see
 * {@link AnimatedTileSpriteSheet}.
 */
export class AnimatedBackgroundTileSpriteSheet extends AnimatedTileSpriteSheet<WaterTileType> {
    public constructor() {
        super("./static/animated-background-tile-sprites.png", descriptor);
    }
}

/**
 * Whether `type` is one of {@link AnimatedBackgroundTileSpriteSheet}'s water
 * types, as opposed to a static {@link BackgroundTileSpriteSheet} type - lets
 * {@link Tile} pick the right sheet without hardcoding the type list itself.
 *
 * @param type - A tile's `groundType` to test.
 * @returns `true` if `type` is a {@link WaterTileType}.
 */
export function isWaterTileType(type: string): type is WaterTileType {
    return WATER_TILE_TYPES.has(type);
}
