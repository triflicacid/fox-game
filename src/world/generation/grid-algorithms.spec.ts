import {describe, expect, it} from "vitest";
import {coordinateKey, CoordinateKey} from "../coordinate-key";
import {erodeComponent} from "./grid-algorithms";

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
