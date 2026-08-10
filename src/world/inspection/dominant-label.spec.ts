import {describe, expect, it} from "vitest";
import {dominantNonNoneLabel, TileRange} from "./dominant-label";

function range(startTileX: number, startTileY: number, endTileX: number, endTileY: number): TileRange {
    return {startTileX, startTileY, endTileX, endTileY};
}

describe("dominantNonNoneLabel", () => {
    it("returns none when every tile label is none", () => {
        const dominant = dominantNonNoneLabel(range(0, 0, 1, 1), () => "none");

        expect(dominant).toBe("none");
    });

    it("returns the most frequent non-none label", () => {
        const labels = new Map<string, string>([
            ["0,0", "lake.shallow"],
            ["1,0", "lake.shallow"],
            ["0,1", "oasis.shallow"],
            ["1,1", "none"],
        ]);

        const dominant = dominantNonNoneLabel(range(0, 0, 1, 1), (tileX, tileY) =>
            labels.get(`${tileX},${tileY}`) ?? "none"
        );

        expect(dominant).toBe("lake.shallow");
    });

    it("keeps the first encountered label when counts are tied", () => {
        const labels = new Map<string, string>([
            ["0,0", "first structure"],
            ["1,0", "second structure"],
        ]);

        const dominant = dominantNonNoneLabel(range(0, 0, 1, 0), (tileX, tileY) =>
            labels.get(`${tileX},${tileY}`) ?? "none"
        );

        expect(dominant).toBe("first structure");
    });

    it("reads rows first (tileY outer, tileX inner) for tie ordering", () => {
        const labels = new Map<string, string>([
            ["0,0", "row0"],
            ["1,0", "row0"],
            ["0,1", "row1"],
            ["1,1", "row1"],
        ]);

        const dominant = dominantNonNoneLabel(range(0, 0, 1, 1), (tileX, tileY) =>
            labels.get(`${tileX},${tileY}`) ?? "none"
        );

        expect(dominant).toBe("row0");
    });
});

