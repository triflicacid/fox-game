import {describe, expect, it} from "vitest";
import {CellularPeakField} from "./noise-field";

const CELL_SIZE = 96;

describe("CellularPeakField", () => {
    it("is deterministic and normalized at positive and negative coordinates", () => {
        const field = new CellularPeakField("test", 1234, 7013, CELL_SIZE);
        for (const [x, y] of [[0, 0], [95, 95], [-1, -1], [-192, 87]]) {
            const value = field.sample(x, y);
            expect(field.sample(x, y)).toBe(value);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    });

    it("changes with the world seed", () => {
        const first = new CellularPeakField("test", 1, 7013, CELL_SIZE);
        const second = new CellularPeakField("test", 2, 7013, CELL_SIZE);

        expect(first.sample(40, 40)).not.toBe(second.sample(40, 40));
    });

    it("places a high peak in every cell", () => {
        const field = new CellularPeakField("test", 1234, 7013, CELL_SIZE);
        for (const [cellX, cellY] of [[0, 0], [-1, 0], [0, -1], [-2, -3]]) {
            let maximum = 0;
            for (let y = cellY * CELL_SIZE; y < (cellY + 1) * CELL_SIZE; y++) {
                for (let x = cellX * CELL_SIZE; x < (cellX + 1) * CELL_SIZE; x++) {
                    maximum = Math.max(maximum, field.sample(x, y));
                }
            }
            expect(maximum).toBeGreaterThan(0.99);
        }
    });
});

