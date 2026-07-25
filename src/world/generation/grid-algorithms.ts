import {coordinateKey, CoordinateKey, parseCoordinateKey} from "../coordinate-key";

/**
 * Erodes ragged edge tiles from `component`: a tile survives iff at least
 * `neighbourThreshold` of its 8 neighbours are also in `component`.
 *
 * @param component - Tile set, as {@link coordinateKey} strings.
 * @param neighbourThreshold - Minimum neighbour count a tile must have to survive.
 * @returns The eroded tile set - a subset of `component`, possibly empty.
 */
export function erodeComponent(
    component: ReadonlySet<CoordinateKey>,
    neighbourThreshold: number,
): Set<CoordinateKey> {
    const eroded = new Set<CoordinateKey>();
    for (const key of component) {
        const [x, y] = parseCoordinateKey(key);
        let neighbourCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (component.has(coordinateKey(x + dx, y + dy))) {
                    neighbourCount++;
                }
            }
        }
        if (neighbourCount >= neighbourThreshold) {
            eroded.add(key);
        }
    }
    return eroded;
}
