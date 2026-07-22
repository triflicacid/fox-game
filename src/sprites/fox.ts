import descriptorJson from "../../static/fox-sprites.json";
import anthroDescriptorJson from "../../static/fox-anthro-sprites.json";
import {SpriteFrame} from "./sprite";
import {AnimatedSpriteSheet} from "./AnimatedSpriteSheet";
import {SpriteSheetDescriptor} from "./sprite-sheet-descriptor";
import {CompassDirection} from "../geometry/direction";

export type FoxSpriteType = CompassDirection | "curl" | "uncurl" | "sleepTurn";

const descriptor = descriptorJson as SpriteSheetDescriptor<FoxSpriteType>;
const anthroDescriptor = anthroDescriptorJson as SpriteSheetDescriptor<CompassDirection>;

/**
 * The fox spritesheet at `./static/fox-sprites.png`, laid out per
 * `./static/fox-sprites.json`
 */
export class FoxSpriteSheet extends AnimatedSpriteSheet<FoxSpriteType> {
    public constructor() {
        super("./static/fox-sprites.png", descriptor);
    }

    /**
     * Locates a fox's static/idle sprite for the given direction.
     *
     * @param direction - Direction to show the idle sprite for.
     * @returns The located frame, as a single-frame "animation"
     */
    public override locateIdleSprite(direction: CompassDirection): SpriteFrame {
        return super.locateIdleSprite(direction);
    }
}

/**
 * Directional anthropomorphic fox sheet used only for the debug standing pose.
 */
export class AnthroFoxSpriteSheet extends AnimatedSpriteSheet<CompassDirection> {
    public constructor() {
        super("./static/fox-anthro-sprites.png", anthroDescriptor);
    }
}

