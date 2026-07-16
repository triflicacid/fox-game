import {SpriteFrame} from "./sprite";
import {SpriteSheet} from "./sprite-sheet";
import {COMPASS_DIRECTIONS, CompassDirection} from "../geometry/direction";

export type FoxSpriteType = CompassDirection | "curl" | "uncurl" | "sleepTurn";

const CELL_SIZE = 120;
const PHASES = 8;

// Row order in the sheet, top to bottom.
const ROW_ORDER: FoxSpriteType[] = [...COMPASS_DIRECTIONS, "curl", "uncurl", "sleepTurn"];

/** The fox spritesheet at `./static/fox-sprites.png`. */
export class FoxSpriteSheet extends SpriteSheet<[type: FoxSpriteType, phase?: number]> {
    public constructor() {
        super("./static/fox-sprites.png");
    }

    /**
     * Locates a single fox animation frame within the sheet. Callers
     * wanting to animate don't need to know how many phases a row has:
     * step through them with {@link SpriteSheet.next}/{@link SpriteSheet.previous}
     * instead of calling this again for each phase.
     *
     * @param type - Compass direction row, or one of the curl-family rows (`"curl"`, `"uncurl"`, `"sleepTurn"`).
     * @param phase - 1-indexed animation frame within that row (1 to 8). Defaults to `1`.
     * @returns The located frame.
     * @throws {Error} If `type` isn't a known row, or `phase` is out of range.
     */
    public override locateSprite(type: FoxSpriteType, phase = 1): SpriteFrame {
        const row = ROW_ORDER.indexOf(type);
        if (row === -1) {
            throw new Error(`Unknown fox sprite type: ${type}`);
        }
        if (phase < 1 || phase > PHASES) {
            throw new Error(`Phase must be between 1 and ${PHASES}, got ${phase}`);
        }

        return {
            x: (phase - 1) * CELL_SIZE,
            y: row * CELL_SIZE,
            w: CELL_SIZE,
            h: CELL_SIZE,
            frameIndex: phase - 1,
            frameCount: PHASES,
        };
    }

    /**
     * All row keys this sheet supports (see {@link locateSprite}), including
     * the curl-family rows.
     *
     * @returns Every valid `type` value for this sheet.
     */
    public override getSpriteTypes(): FoxSpriteType[] {
        return [...ROW_ORDER];
    }
}
