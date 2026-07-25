import {describe, expect, it, vi} from "vitest";
import {TileSet} from "../tile-set";
import {computeEdgeDistances, erodeComponent, findCoreTiles, floodFill8, isFullySurrounded} from "./grid-algorithms";

/** Builds a filled rectangular TileSet. */
function filledRect(x0: number, y0: number, x1: number, y1: number): TileSet {
    const tiles = new TileSet();
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            tiles.add(x, y);
        }
    }
    return tiles;
}


describe("computeEdgeDistances", () => {
    it("returns an empty map for an empty component", () => {
        expect(computeEdgeDistances(new TileSet()).size).toBe(0);
    });

    it("gives a single tile distance 1", () => {
        const component = new TileSet();
        component.add(0, 0);
        const distances = computeEdgeDistances(component);
        expect(distances.get(0, 0)).toBe(1);
        expect(distances.size).toBe(1);
    });

    it("gives every border tile distance 1 and the centre distance 2 in a 3x3 square", () => {
        // The centre (1,1) is the only fully-surrounded tile; all 8 border tiles are at distance 1.
        const component = filledRect(0, 0, 2, 2);
        const distances = computeEdgeDistances(component);
        for (let y = 0; y <= 2; y++) {
            for (let x = 0; x <= 2; x++) {
                const expected = (x === 1 && y === 1) ? 2 : 1;
                expect(distances.get(x, y)).toBe(expected);
            }
        }
    });

    it("produces distances 1, 2, 3 for successive rings of a 5x5 square", () => {
        // Outer ring: distance 1. Next ring: distance 2. Centre tile: distance 3.
        const component = filledRect(0, 0, 4, 4);
        const distances = computeEdgeDistances(component);
        const outerRing: [number, number][] = [
            ...[0, 1, 2, 3, 4].map(x => [x, 0] as [number, number]),
            ...[0, 1, 2, 3, 4].map(x => [x, 4] as [number, number]),
            ...[1, 2, 3].map(y => [0, y] as [number, number]),
            ...[1, 2, 3].map(y => [4, y] as [number, number]),
        ];
        for (const [x, y] of outerRing) {
            expect(distances.get(x, y)).toBe(1);
        }
        const midRing: [number, number][] = [
            [1, 1], [2, 1], [3, 1],
            [1, 3], [2, 3], [3, 3],
            [1, 2], [3, 2],
        ];
        for (const [x, y] of midRing) {
            expect(distances.get(x, y)).toBe(2);
        }
        expect(distances.get(2, 2)).toBe(3);
    });

    it("assigns distance 1 to all tiles of two disconnected single tiles", () => {
        // Neither isolated tile is fully surrounded, so both are shore tiles.
        const component = new TileSet();
        component.add(0, 0);
        component.add(10, 10);
        const distances = computeEdgeDistances(component);
        expect(distances.get(0, 0)).toBe(1);
        expect(distances.get(10, 10)).toBe(1);
        expect(distances.size).toBe(2);
    });

    it("does not mutate the input set", () => {
        const component = filledRect(0, 0, 2, 2);
        const sizeBefore = component.size;
        computeEdgeDistances(component);
        expect(component.size).toBe(sizeBefore);
        for (let y = 0; y <= 2; y++) {
            for (let x = 0; x <= 2; x++) {
                expect(component.has(x, y)).toBe(true);
            }
        }
    });
});


describe("findCoreTiles", () => {
    it("returns only the centre of a filled 3x3 square", () => {
        // Only (1,1) has all 8 neighbours inside the square.
        const result = findCoreTiles(filledRect(0, 0, 2, 2));
        expect(result.size).toBe(1);
        expect(result.has(1, 1)).toBe(true);
    });

    it("returns the four interior tiles of a filled 4x4 square", () => {
        const result = findCoreTiles(filledRect(0, 0, 3, 3));
        const expected = new TileSet();
        expected.add(1, 1); expected.add(2, 1); expected.add(1, 2); expected.add(2, 2);
        expect(result.equals(expected)).toBe(true);
    });

    it("returns an empty set for a single row", () => {
        // No tile in a 1xN row has all 8 neighbours present.
        expect(findCoreTiles(filledRect(0, 0, 4, 0)).size).toBe(0);
    });

    it("returns an empty set for an empty component", () => {
        expect(findCoreTiles(new TileSet()).size).toBe(0);
    });

    it("returns a new set and does not mutate the input", () => {
        const component = filledRect(0, 0, 2, 2);
        const result = findCoreTiles(component);
        expect(result).not.toBe(component);
        expect(component.size).toBe(9);
    });
});


describe("isFullySurrounded", () => {
    it("returns true for the centre tile of a filled 3x3 square", () => {
        expect(isFullySurrounded(filledRect(0, 0, 2, 2), 1, 1)).toBe(true);
    });

    it("returns false for a corner tile of a filled 3x3 square", () => {
        expect(isFullySurrounded(filledRect(0, 0, 2, 2), 0, 0)).toBe(false);
    });

    it("returns false for an edge midpoint of a filled 3x3 square", () => {
        // Edge midpoint (1,0) has 5 neighbours but (0,-1), (1,-1), (2,-1) are outside.
        expect(isFullySurrounded(filledRect(0, 0, 2, 2), 1, 0)).toBe(false);
    });

    it("returns false for a single isolated tile", () => {
        const single = new TileSet();
        single.add(0, 0);
        expect(isFullySurrounded(single, 0, 0)).toBe(false);
    });

    it("returns false when exactly one of the 8 neighbours is absent", () => {
        // 3x3 square but missing the top-left corner (0,0), so (1,1) has only 7 neighbours.
        const component = new TileSet();
        for (let y = 0; y <= 2; y++) {
            for (let x = 0; x <= 2; x++) {
                if (x !== 0 || y !== 0) component.add(x, y);
            }
        }
        expect(isFullySurrounded(component, 1, 1)).toBe(false);
    });

    it("returns true for every interior tile of a filled 5x5 square", () => {
        const component = filledRect(0, 0, 4, 4);
        for (let y = 1; y <= 3; y++) {
            for (let x = 1; x <= 3; x++) {
                expect(isFullySurrounded(component, x, y)).toBe(true);
            }
        }
    });
});


describe("erodeComponent", () => {
    it("retains only the centre of a 3x3 square with threshold 6", () => {
        // Corners have 3 neighbours, edge midpoints have 5, centre has 8.
        // Threshold 6 removes everything except the centre.
        const result = erodeComponent(filledRect(0, 0, 2, 2), 6);
        expect(result.size).toBe(1);
        expect(result.has(1, 1)).toBe(true);
    });

    it("retains only the four interior tiles of a 4x4 square with threshold 6", () => {
        // Perimeter tiles have at most 5 neighbours; interior tiles have 8.
        const result = erodeComponent(filledRect(0, 0, 3, 3), 6);
        const expected = new TileSet();
        expected.add(1, 1); expected.add(2, 1); expected.add(1, 2); expected.add(2, 2);
        expect(result.equals(expected)).toBe(true);
    });

    it("retains centre and edge midpoints of a 3x3 square with threshold 5", () => {
        // Edge midpoints have exactly 5 neighbours (>= 5 passes); corners have 3.
        const result = erodeComponent(filledRect(0, 0, 2, 2), 5);
        const expected = new TileSet();
        expected.add(1, 0); expected.add(0, 1); expected.add(1, 1); expected.add(2, 1); expected.add(1, 2);
        expect(result.equals(expected)).toBe(true);
    });

    it("returns an empty set for an empty component", () => {
        expect(erodeComponent(new TileSet(), 5).size).toBe(0);
    });

    it("removes a single tile (0 neighbours, any positive threshold)", () => {
        const single = new TileSet();
        single.add(0, 0);
        expect(erodeComponent(single, 1).size).toBe(0);
    });

    it("retains every tile when threshold is 0", () => {
        const component = filledRect(0, 0, 2, 2);
        const result = erodeComponent(component, 0);
        expect(result.equals(component)).toBe(true);
    });

    it("does not mutate the input set", () => {
        const component = filledRect(0, 0, 2, 2);
        erodeComponent(component, 6);
        expect(component.size).toBe(9);
        for (let y = 0; y <= 2; y++) {
            for (let x = 0; x <= 2; x++) {
                expect(component.has(x, y)).toBe(true);
            }
        }
    });
});


describe("floodFill8", () => {
    /** Returns a candidate predicate bounded to the rectangle [x0, x1] by [y0, y1]. */
    function inRect(x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => boolean {
        return (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }

    it("fills a finite all-candidate region and reports no cap exceeded", () => {
        const {tiles, exceededCap} = floodFill8(0, 0, inRect(0, 0, 2, 2), 100);
        expect(tiles.equals(filledRect(0, 0, 2, 2))).toBe(true);
        expect(exceededCap).toBe(false);
    });

    it("reaches diagonal neighbours, proving 8-connectivity", () => {
        // Checkerboard: only tiles where (x+y) is even are candidates inside 3x3.
        // (0,0) reaches (1,1) via diagonal, then (2,0), (0,2), (2,2) via diagonals of (1,1).
        const isCandidate = (x: number, y: number) =>
            x >= 0 && x <= 2 && y >= 0 && y <= 2 && (x + y) % 2 === 0;
        const {tiles, exceededCap} = floodFill8(0, 0, isCandidate, 100);
        const expected = new TileSet();
        expected.add(0, 0); expected.add(1, 1); expected.add(2, 0);
        expected.add(0, 2); expected.add(2, 2);
        expect(tiles.equals(expected)).toBe(true);
        expect(exceededCap).toBe(false);
    });

    it("does not cross into a disconnected candidate blob", () => {
        // Blob A: (0,0)-(1,1). Blob B: (10,0)-(11,1). Too far apart for 8-connectivity.
        const blobA = inRect(0, 0, 1, 1);
        const blobB = inRect(10, 0, 11, 1);
        const {tiles} = floodFill8(0, 0, (x, y) => blobA(x, y) || blobB(x, y), 100);
        expect(tiles.equals(filledRect(0, 0, 1, 1))).toBe(true);
    });

    it("reports exceededCap false when the region fits within maxTiles", () => {
        const {tiles, exceededCap} = floodFill8(0, 0, inRect(0, 0, 2, 2), 9);
        expect(tiles.size).toBe(9);
        expect(exceededCap).toBe(false);
    });

    it("reports exceededCap true when tiles grow past maxTiles", () => {
        // Seed (0,0) is always added. Then (1,0) is added as a candidate.
        // tiles.size becomes 2, which is > maxTiles of 1, so the next iteration aborts.
        const {exceededCap} = floodFill8(0, 0, (x, y) => x === 1 && y === 0, 1);
        expect(exceededCap).toBe(true);
    });

    it("always includes the seed even when its neighbours are non-candidates", () => {
        const {tiles, exceededCap} = floodFill8(5, 5, () => false, 100);
        expect(tiles.size).toBe(1);
        expect(tiles.has(5, 5)).toBe(true);
        expect(exceededCap).toBe(false);
    });

    it("never calls isCandidate for the seed coordinate", () => {
        const isCandidate = vi.fn(() => false);
        floodFill8(3, 7, isCandidate, 100);
        expect(isCandidate).not.toHaveBeenCalledWith(3, 7);
    });
});
