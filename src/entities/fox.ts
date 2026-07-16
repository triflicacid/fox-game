import {MovableEntity} from "./movable-entity";
import {FoxSpriteSheet, FoxSpriteType} from "../sprites/fox";
import {CompassDirection} from "../geometry/direction";
import {SpriteFrame} from "../sprites/sprite";

/** Behavioural states a {@link Fox} entity can be in. */
export type FoxStatus = "walking";

/** How long, in milliseconds, a fox's walk animation shows each frame before advancing. */
const WALK_FRAME_MS = 120;

/** Direction a fox faces when spawned. */
const INITIAL_FACING: CompassDirection = "N";

/** The fox entity: a {@link MovableEntity} that can be driven around by a {@link MovementController}. */
export class Fox extends MovableEntity<[type: FoxSpriteType, phase?: number], FoxStatus> {
    public constructor() {
        const spriteSheet = new FoxSpriteSheet();
        super(spriteSheet, "walking", INITIAL_FACING, spriteSheet.locateSprite(INITIAL_FACING), WALK_FRAME_MS);
    }

    protected override locateFrameForDirection(direction: CompassDirection): SpriteFrame {
        return this.spriteSheet.locateSprite(direction);
    }
}
