import {Entity} from "./entity";
import {FoxSpriteSheet, FoxSpriteType} from "../sprites/fox";
import {randomElement} from "../util";
import {COMPASS_DIRECTIONS} from "../geometry/direction";

/** Behavioural states a {@link Fox} entity can be in. */
export type FoxStatus = "walking";

/** How long, in milliseconds, a fox's walk animation shows each frame before advancing. */
const WALK_FRAME_MS = 120;

/** The player-controlled fox entity. */
export class Fox extends Entity<[type: FoxSpriteType, phase?: number], FoxStatus> {
    public constructor() {
        const spriteSheet = new FoxSpriteSheet();
        const facing = randomElement(COMPASS_DIRECTIONS);
        super(spriteSheet, "walking", facing, spriteSheet.locateSprite(facing), WALK_FRAME_MS);
    }
}
