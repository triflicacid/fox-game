import {describe, expect, it, vi} from "vitest";
import {NoiseField} from "../noise-field";
import {TerrainDepthConfig} from "../biome/terrain-depth";
import {ChunkGenerator} from "./chunk-generator";

const TEST_DEPTH_CONFIG: TerrainDepthConfig = {
    maximumDepthTiles: 3,
    lightOnlyDepthTiles: 1,
    noisePerturbationTiles: 0,
    darkVariantNoiseThreshold: 0.5,
};

function requireField(generator: ChunkGenerator, name: string): NoiseField {
    const field = generator.getFields().get(name);
    if (!field) {
        throw new Error(`Missing test field: ${name}`);
    }
    return field;
}

/** Creates a generator with a vertical Plains/Desert border at world x=-1/0. */
function controlledGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    const moistureSample = vi.spyOn(requireField(generator, "moisture"), "sample").mockReturnValue(0);
    const temperatureSample = vi.spyOn(requireField(generator, "temperature"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 1 : 0);
    for (const name of ["grass_variant", "sand_variant"]) {
        vi.spyOn(requireField(generator, name), "sample").mockImplementation((_worldX, worldY) => worldY < 8 ? 0.25 : 0.75);
    }
    return {generator, moistureSample, temperatureSample};
}

/** Creates a generator with a vertical Plains/Forest border at world x=-1/0. */
function controlledForestGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    vi.spyOn(requireField(generator, "temperature"), "sample").mockReturnValue(0);
    vi.spyOn(requireField(generator, "moisture"), "sample").mockImplementation((worldX) => worldX >= 0 ? 1 : 0);
    for (const name of ["grass_variant", "tree_variant"]) {
        vi.spyOn(requireField(generator, name), "sample").mockImplementation((_worldX, worldY) => worldY < 8 ? 0.25 : 0.75);
    }
    return generator;
}

describe("ChunkGenerator biome-interior terrain depth", () => {
    it("selects explicit depth bands on both sides of a chunk boundary", () => {
        const {generator} = controlledGenerator();
        const plains = generator.generate(-1, 0).tiles;
        const desert = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const lowNoise = localY < 8;

            expect(plains[localY][15]).toMatchObject({biomeTag: "plains", groundType: "grass2"});
            expect(plains[localY][14].groundType).toBe(lowNoise ? "grass1" : "grass2");
            expect(plains[localY][13].groundType).toBe(lowNoise ? "grass1" : "grass3");

            expect(desert[localY][0]).toMatchObject({biomeTag: "desert", groundType: "sand1"});
            expect(desert[localY][1].groundType).toBe(lowNoise ? "sand2" : "sand1");
            expect(desert[localY][2].groundType).toBe(lowNoise ? "sand2" : "sand3");
        }
    });

    it("selects explicit depth bands across a Plains/Forest boundary", () => {
        const generator = controlledForestGenerator();
        const plains = generator.generate(-1, 0).tiles;
        const forest = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const lowNoise = localY < 8;

            expect(plains[localY][15]).toMatchObject({biomeTag: "plains", groundType: "grass2"});
            expect(plains[localY][14].groundType).toBe(lowNoise ? "grass1" : "grass2");
            expect(plains[localY][13].groundType).toBe(lowNoise ? "grass1" : "grass3");

            expect(forest[localY][0]).toMatchObject({biomeTag: "forest", groundType: "forest2"});
            expect(forest[localY][1].groundType).toBe(lowNoise ? "forest1" : "forest2");
            expect(forest[localY][2].groundType).toBe(lowNoise ? "forest1" : "forest3");
        }
    });

    it("produces the same neighboring chunks regardless of generation order", () => {
        const first = controlledGenerator().generator;
        const plainsFirst = first.generate(-1, 0);
        const desertSecond = first.generate(0, 0);

        const second = controlledGenerator().generator;
        const desertFirst = second.generate(0, 0);
        const plainsSecond = second.generate(-1, 0);

        expect(plainsFirst).toEqual(plainsSecond);
        expect(desertSecond).toEqual(desertFirst);
    });

    it("samples climate exactly once per cell in the bounded padded mask", () => {
        const {generator, moistureSample, temperatureSample} = controlledGenerator();
        generator.generate(-1, 0);

        const halo = TEST_DEPTH_CONFIG.maximumDepthTiles + 1;
        const paddedArea = (16 + 2 * halo) ** 2;
        expect(moistureSample).toHaveBeenCalledTimes(paddedArea);
        expect(temperatureSample).toHaveBeenCalledTimes(paddedArea);
    });

    it("rejects invalid terrain-depth configuration", () => {
        expect(() => new ChunkGenerator(1, [], {
            ...TEST_DEPTH_CONFIG,
            maximumDepthTiles: 0,
        })).toThrow(RangeError);
    });
});


