import {describe, expect, it, vi} from "vitest";
import {coordinateKey, CoordinateKey} from "../coordinate-key";
import {erodeComponent, floodFill8} from "./grid-algorithms";

/** Builds a filled rectangular set of coordinateKey strings. */
function filledRect(x0: number, y0: number, x1: number, y1: number): Set<CoordinateKey> {
    const tiles = new Set<CoordinateKey>();
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            tiles.add(coordinateKey(x, y));
        }
    }
    return tiles;
}

describe("erodeComponent", () => {
    it("retains only the centre of a 3x3 square with threshold 6", () => {
        // Corners have 3 neighbours, edge midpoints have 5, centre has 8.
        // Threshold 6 removes everything except the centre.
        const component = filledRect(0, 0, 2, 2);
        const result = erodeComponent(component, 6);
        expect(result).toEqual(new Set([coordinateKey(1, 1)]));
    });

    it("retains only the four interior tiles of a 4x4 square with threshold 6", () => {
        // Perimeter tiles have at most 5 neighbours; interior tiles have 8.
        const component = filledRect(0, 0, 3, 3);
        const result = erodeComponent(component, 6);
        expect(result).toEqual(new Set([
            coordinateKey(1, 1),
            coordinateKey(2, 1),
            coordinateKey(1, 2),
            coordinateKey(2, 2),
        ]));
    });

    it("retains centre and edge midpoints of a 3x3 square with threshold 5", () => {
        // Edge midpoints have exactly 5 neighbours (>= 5 passes); corners have 3.
        const component = filledRect(0, 0, 2, 2);
        const result = erodeComponent(component, 5);
        expect(result).toEqual(new Set([
            coordinateKey(1, 0),
            coordinateKey(0, 1),
            coordinateKey(1, 1),
            coordinateKey(2, 1),
            coordinateKey(1, 2),
        ]));
    });

    it("returns an empty set for an empty component", () => {
        expect(erodeComponent(new Set(), 5)).toEqual(new Set());
    });

    it("removes a single tile (0 neighbours, any positive threshold)", () => {
        const single = new Set([coordinateKey(0, 0)]);
        expect(erodeComponent(single, 1)).toEqual(new Set());
    });

    it("retains every tile when threshold is 0", () => {
        const component = filledRect(0, 0, 2, 2);
        const result = erodeComponent(component, 0);
        expect(result).toEqual(component);
    });

    it("does not mutate the input set", () => {
        const component = filledRect(0, 0, 2, 2);
        const snapshot = new Set(component);
        erodeComponent(component, 6);
        expect(component).toEqual(snapshot);
    });
});

describe("floodFill8", () => {
    /** Returns a candidate predicate bounded to the rectangle [x0, x1] by [y0, y1]. */
    function inRect(x0: number, y0: number, x1: number, y1: number): (x: number, y: number) => boolean {
        return (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    }

    it("fills a finite all-candidate region and reports no cap exceeded", () => {
        const {tiles, exceededCap} = floodFill8(0, 0, inRect(0, 0, 2, 2), 100);
        expect(tiles).toEqual(filledRect(0, 0, 2, 2));
        expect(exceededCap).toBe(false);
    });

    it("reaches diagonal neighbours, proving 8-connectivity", () => {
        // Checkerboard: only tiles where (x+y) is even are candidates inside 3x3.
        // (0,0) reaches (1,1) via diagonal, then (2,0), (0,2), (2,2) via diagonals of (1,1).
        const isCandidate = (x: number, y: number) =>
            x >= 0 && x <= 2 && y >= 0 && y <= 2 && (x + y) % 2 === 0;
        const {tiles, exceededCap} = floodFill8(0, 0, isCandidate, 100);
        expect(tiles).toEqual(new Set<CoordinateKey>([
            coordinateKey(0, 0),
            coordinateKey(1, 1),
            coordinateKey(2, 0),
            coordinateKey(0, 2),
            coordinateKey(2, 2),
        ]));
        expect(exceededCap).toBe(false);
    });

    it("does not cross into a disconnected candidate blob", () => {
        // Blob A: (0,0)-(1,1). Blob B: (10,0)-(11,1). Too far apart for 8-connectivity.
        const blobA = inRect(0, 0, 1, 1);
        const blobB = inRect(10, 0, 11, 1);
        const isCandidate = (x: number, y: number) => blobA(x, y) || blobB(x, y);
        const {tiles} = floodFill8(0, 0, isCandidate, 100);
        expect(tiles).toEqual(filledRect(0, 0, 1, 1));
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
        expect(tiles).toEqual(new Set([coordinateKey(5, 5)]));
        expect(exceededCap).toBe(false);
    });

    it("never calls isCandidate for the seed coordinate", () => {
        const isCandidate = vi.fn(() => false);
        floodFill8(3, 7, isCandidate, 100);
        expect(isCandidate).not.toHaveBeenCalledWith(3, 7);
    });
});

