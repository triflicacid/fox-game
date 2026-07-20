import {Cache} from "../../store/cache";
import {coordinateKey} from "../coordinate-key";

/** An absolute world tile position, in tiles from the world origin. */
export type Position = readonly [worldX: number, worldY: number];

/** Memoises a function of an absolute world tile position. */
export class PositionCache<V> extends Cache<Position, V> {
    protected override encodeKey([worldX, worldY]: Position): string {
        return coordinateKey(worldX, worldY);
    }
}
