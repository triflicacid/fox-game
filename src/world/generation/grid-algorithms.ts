import {coordinateKey, CoordinateKey, parseCoordinateKey} from "../coordinate-key";

/**
 * 8-connected flood fill from `(startX, startY)`. The seed is always included
 * regardless of `isCandidate`. Fills until no more candidate neighbours exist
 * or `tiles.size` exceeds `maxTiles`, in which case `exceededCap` is `true`.
 *
 * @param startX - Seed tile's X coordinate.
 * @param startY - Seed tile's Y coordinate.
 * @param isCandidate - Returns whether a neighbour tile may be added. Never called for the seed.
 * @param maxTiles - Tile count above which the fill is aborted and `exceededCap` is set.
 * @returns The filled tile set and whether it exceeded the cap.
 */
export function floodFill8(
    startX: number,
    startY: number,
    isCandidate: (x: number, y: number) => boolean,
    maxTiles: number,
): {tiles: Set<CoordinateKey>; exceededCap: boolean} {
    const tiles = new Set<CoordinateKey>([coordinateKey(startX, startY)]);
    const queue: [number, number][] = [[startX, startY]];
    let exceededCap = false;

    while (queue.length > 0) {
        if (tiles.size > maxTiles) {
            exceededCap = true;
            break;
        }
        const [x, y] = queue.shift() as [number, number];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                const nx = x + dx;
                const ny = y + dy;
                const key = coordinateKey(nx, ny);
                if (tiles.has(key) || !isCandidate(nx, ny)) {
                    continue;
                }
                tiles.add(key);
                queue.push([nx, ny]);
            }
        }
    }

    return {tiles, exceededCap};
}

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
