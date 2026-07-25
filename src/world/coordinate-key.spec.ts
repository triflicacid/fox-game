import { describe, it, expect } from "vitest";
import { coordinateKey, parseCoordinateKey } from "./coordinate-key";

describe("coordinateKey / parseCoordinateKey", () => {
    it.each([
        [0, 0],
        [1, 2],
        [-1, -2],
        [100, -500],
        [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
    ])("round-trips (%i, %i)", (x, y) => {
        expect(parseCoordinateKey(coordinateKey(x, y))).toEqual([x, y]);
    });

    it("produces distinct keys for distinct coordinates", () => {
        const keys = [
            coordinateKey(0, 1),
            coordinateKey(1, 0),
            coordinateKey(0, 0),
            coordinateKey(1, 1),
        ];
        expect(new Set(keys).size).toBe(keys.length);
    });
});

