import {ReadonlyCoordSet, CoordMap, CoordSet} from "../coord-set";

/** The eight offsets around one grid cell. */
const NEIGHBOUR_OFFSETS_8: readonly (readonly [dx: number, dy: number])[] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
];

/**
 * Computes capped 8-connected distance from unlike-region borders in a
 * rectangular mask. Border cells have depth 1; cells farther than
 * `maximumDepth` (or in a uniform mask) retain the cap.
 *
 * Only neighbours inside `regions` are inspected. Callers that read a central
 * sub-area must therefore provide a halo of `maximumDepth + 1` cells.
 *
 * @param regions - Rectangular row-major region identities.
 * @param maximumDepth - Non-negative integer depth cap.
 * @returns A new rectangular row-major depth grid.
 */
export function computeCappedRegionDepths<T>(
    regions: readonly (readonly T[])[],
    maximumDepth: number,
): number[][] {
    if (!Number.isInteger(maximumDepth) || maximumDepth < 0) {
        throw new RangeError("maximumDepth must be a non-negative integer.");
    }
    if (regions.length === 0) {
        return [];
    }

    const width = regions[0].length;
    if (regions.some((row) => row.length !== width)) {
        throw new Error("regions must be rectangular.");
    }

    const height = regions.length;
    const depths = Array.from({length: height}, () => Array<number>(width).fill(maximumDepth));
    if (width === 0 || maximumDepth === 0) {
        return depths;
    }

    const queue: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const region = regions[y][x];
            const isBorder = NEIGHBOUR_OFFSETS_8.some(([dx, dy]) => {
                const nx = x + dx;
                const ny = y + dy;
                return nx >= 0 && nx < width && ny >= 0 && ny < height && regions[ny][nx] !== region;
            });
            if (isBorder) {
                depths[y][x] = 1;
                queue.push(y * width + x);
            }
        }
    }

    for (const index of queue) {
        const x = index % width;
        const y = Math.floor(index / width);
        const nextDepth = depths[y][x] + 1;
        if (nextDepth >= maximumDepth) {
            continue;
        }
        for (const [dx, dy] of NEIGHBOUR_OFFSETS_8) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height
                || regions[ny][nx] !== regions[y][x] || depths[ny][nx] <= nextDepth) {
                continue;
            }
            depths[ny][nx] = nextDepth;
            queue.push(ny * width + nx);
        }
    }

    return depths;
}

/**
 * Whether every one of `(x, y)`'s 8 neighbours is also in `component`.
 *
 * @param component - The tile set to check against.
 * @param x - Tile's X position, in tiles from the world origin.
 * @param y - Tile's Y position, in tiles from the world origin.
 * @returns Whether `(x, y)` is fully interior to `component`.
 */
export function isFullySurrounded(component: ReadonlyCoordSet, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) {
                continue;
            }
            if (!component.has(x + dx, y + dy)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Tiles in `component` whose all 8 neighbours are also in `component`.
 *
 * @param component - The final (smoothed) tile set.
 * @returns The core (interior) subset of `component`, possibly empty.
 */
export function findCoreTiles(component: ReadonlyCoordSet): CoordSet {
    const core = new CoordSet();
    for (const [x, y] of component) {
        if (isFullySurrounded(component, x, y)) {
            core.add(x, y);
        }
    }
    return core;
}

/**
 * Each tile's distance from the component's edge, in 8-connected rings:
 * edge tiles (at least one neighbour outside `component`) get distance 1,
 * increasing by 1 per ring moving inward.
 *
 * @param component - The tile set.
 * @returns Every tile's edge distance.
 */
export function computeEdgeDistances(component: ReadonlyCoordSet): CoordMap<number> {
    const distances = new CoordMap<number>();
    const queue: [number, number][] = [];

    for (const [x, y] of component) {
        if (!isFullySurrounded(component, x, y)) {
            distances.set(x, y, 1);
            queue.push([x, y]);
        }
    }

    for (const [x, y] of queue) {
        const distance = distances.get(x, y) as number;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                const nx = x + dx;
                const ny = y + dy;
                if (!component.has(nx, ny) || distances.has(nx, ny)) {
                    continue;
                }
                distances.set(nx, ny, distance + 1);
                queue.push([nx, ny]);
            }
        }
    }

    return distances;
}

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
): {tiles: CoordSet; exceededCap: boolean} {
    const tiles = new CoordSet();
    tiles.add(startX, startY);
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
                if (tiles.has(nx, ny) || !isCandidate(nx, ny)) {
                    continue;
                }
                tiles.add(nx, ny);
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
 * @param component - The tile set to erode.
 * @param neighbourThreshold - Minimum neighbour count a tile must have to survive.
 * @returns The eroded tile set - a subset of `component`, possibly empty.
 */
export function erodeComponent(component: ReadonlyCoordSet, neighbourThreshold: number): CoordSet {
    const eroded = new CoordSet();
    for (const [x, y] of component) {
        let neighbourCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (component.has(x + dx, y + dy)) {
                    neighbourCount++;
                }
            }
        }
        if (neighbourCount >= neighbourThreshold) {
            eroded.add(x, y);
        }
    }
    return eroded;
}
