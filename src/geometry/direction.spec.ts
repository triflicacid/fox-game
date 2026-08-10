import {describe, expect, it} from "vitest";
import {COMPASS_DIRECTIONS, toCompassDirection} from "./direction";

describe("COMPASS_DIRECTIONS", () => {
    it("lists all compass directions in clockwise order from north", () => {
        expect(COMPASS_DIRECTIONS).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    });
});

describe("toCompassDirection", () => {
    it.each([
        [1, 0, "E"],
        [1, 1, "SE"],
        [0, 1, "S"],
        [-1, 1, "SW"],
        [-1, 0, "W"],
        [-1, -1, "NW"],
        [0, -1, "N"],
        [1, -1, "NE"],
    ] as const)("maps (%i, %i) to %s", (dx, dy, direction) => {
        expect(toCompassDirection(dx, dy)).toBe(direction);
    });
});

