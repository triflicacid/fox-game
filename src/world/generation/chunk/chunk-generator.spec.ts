import {describe, expect, it, vi} from "vitest";
import {ConstantField, NoiseField} from "../noise-field";
import {TerrainDepthConfig} from "../biome/terrain-depth";
import {ChunkGenerator} from "./chunk-generator";
import {DesertBiome} from "../biome/desert-biome";
import {ForestBiome} from "../biome/forest-biome";
import {TundraBiome} from "../biome/tundra-biome";

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

/**
 * Plains-side climate that escapes Desert, Forest, and (temporarily widened
 * - see `TUNDRA_CONFIG`'s doc comment) Tundra all at once: moisture above
 * Desert/Tundra's shared `0.58` boundary, temperature above Forest's `0.52`
 * boundary. With Tundra's thresholds widened to the whole Desert/Forest-
 * unclaimed quadrant, this is the only climate corner left for Plains.
 */
const ESCAPES_ALL_SPECIFIC_BIOMES = {moisture: 0.7, temperature: 0.6} as const;

/**
 * Creates a generator with a vertical Plains/Desert border at world x=-1/0.
 */
function controlledGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    const moistureSample = vi.spyOn(requireField(generator, "moisture"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 0 : ESCAPES_ALL_SPECIFIC_BIOMES.moisture);
    const temperatureSample = vi.spyOn(requireField(generator, "temperature"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 1 : ESCAPES_ALL_SPECIFIC_BIOMES.temperature);
    for (const name of ["grass_variant", "sand_variant"]) {
        vi.spyOn(requireField(generator, name), "sample").mockImplementation((_worldX, worldY) => worldY < 8 ? 0.25 : 0.75);
    }
    return {generator, moistureSample, temperatureSample};
}

/**
 * Creates a generator with a vertical Plains/Forest border at world x=-1/0.
 */
function controlledForestGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    vi.spyOn(requireField(generator, "temperature"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 0 : ESCAPES_ALL_SPECIFIC_BIOMES.temperature);
    vi.spyOn(requireField(generator, "moisture"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 1 : ESCAPES_ALL_SPECIFIC_BIOMES.moisture);
    for (const name of ["grass_variant", "tree_variant"]) {
        vi.spyOn(requireField(generator, name), "sample").mockImplementation((_worldX, worldY) => worldY < 8 ? 0.25 : 0.75);
    }
    return generator;
}

/** Creates a generator with a vertical Plains/Tundra border at world x=-1/0, moisture fixed on the Tundra side so terrain always resolves to the barren palette. */
function controlledTundraGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    vi.spyOn(requireField(generator, "temperature"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 0.05 : ESCAPES_ALL_SPECIFIC_BIOMES.temperature);
    vi.spyOn(requireField(generator, "moisture"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 0.1 : ESCAPES_ALL_SPECIFIC_BIOMES.moisture);
    for (const name of ["grass_variant", "tundra_variant"]) {
        vi.spyOn(requireField(generator, name), "sample").mockImplementation((_worldX, worldY) => worldY < 8 ? 0.25 : 0.75);
    }
    return generator;
}

/**
 * Creates a generator with the same Plains/Tundra border, but with terrain
 * variant noise fixed (so light/dark banding doesn't confound the check) and
 * moisture on the Tundra side split by row, to isolate the icy/barren
 * wetness sub-banding at both border and capped interior depth.
 */
function controlledTundraWetnessGenerator() {
    const generator = new ChunkGenerator(1234, [], TEST_DEPTH_CONFIG);
    vi.spyOn(requireField(generator, "temperature"), "sample")
        .mockImplementation((worldX) => worldX >= 0 ? 0.05 : ESCAPES_ALL_SPECIFIC_BIOMES.temperature);
    vi.spyOn(requireField(generator, "moisture"), "sample")
        .mockImplementation((worldX, worldY) => worldX >= 0 ? (worldY < 8 ? 0.1 : 0.3) : ESCAPES_ALL_SPECIFIC_BIOMES.moisture);
    vi.spyOn(requireField(generator, "tundra_variant"), "sample").mockReturnValue(0.9);
    return generator;
}

describe("ChunkGenerator biome-interior terrain depth", () => {
    it("selects explicit depth bands on both sides of a chunk boundary", () => {
        const {generator} = controlledGenerator();
        const plains = generator.generate(-1, 0).tiles;
        const desert = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const lowNoise = localY < 8;

            expect(plains[localY][15]).toMatchObject({biomeTag: "plains", groundType: "plains.grass2"});
            expect(plains[localY][14].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass2");
            expect(plains[localY][13].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass3");

            expect(desert[localY][0]).toMatchObject({biomeTag: "desert", groundType: "desert.sand1"});
            expect(desert[localY][1].groundType).toBe(lowNoise ? "desert.sand2" : "desert.sand1");
            expect(desert[localY][2].groundType).toBe(lowNoise ? "desert.sand2" : "desert.sand3");
        }
    });

    it("selects explicit depth bands across a Plains/Forest boundary", () => {
        const generator = controlledForestGenerator();
        const plains = generator.generate(-1, 0).tiles;
        const forest = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const lowNoise = localY < 8;

            expect(plains[localY][15]).toMatchObject({biomeTag: "plains", groundType: "plains.grass2"});
            expect(plains[localY][14].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass2");
            expect(plains[localY][13].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass3");

            expect(forest[localY][0]).toMatchObject({biomeTag: "forest", groundType: "forest2"});
            expect(forest[localY][1].groundType).toBe(lowNoise ? "forest1" : "forest2");
            expect(forest[localY][2].groundType).toBe(lowNoise ? "forest1" : "forest3");
        }
    });

    it("selects explicit depth bands across a Plains/Tundra boundary", () => {
        const generator = controlledTundraGenerator();
        const plains = generator.generate(-1, 0).tiles;
        const tundra = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const lowNoise = localY < 8;

            expect(plains[localY][15]).toMatchObject({biomeTag: "plains", groundType: "plains.grass2"});
            expect(plains[localY][14].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass2");
            expect(plains[localY][13].groundType).toBe(lowNoise ? "plains.grass1" : "plains.grass3");

            expect(tundra[localY][0]).toMatchObject({biomeTag: "tundra", groundType: "tundra.barren.light"});
            expect(tundra[localY][1].groundType).toBe(lowNoise ? "tundra.barren.medium" : "tundra.barren.light");
            expect(tundra[localY][2].groundType).toBe(lowNoise ? "tundra.barren.medium" : "tundra.barren.dark");
        }
    });

    it("splits Tundra terrain into icy/barren bands by moisture at both border and capped interior depth", () => {
        const generator = controlledTundraWetnessGenerator();
        const tundra = generator.generate(0, 0).tiles;

        for (let localY = 0; localY < 16; localY++) {
            const barren = localY < 8;

            expect(tundra[localY][0]).toMatchObject({
                biomeTag: "tundra",
                groundType: barren ? "tundra.barren.light" : "tundra.icy.light",
            });
            expect(tundra[localY][2].groundType).toBe(barren ? "tundra.barren.dark" : "tundra.icy.dark");
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

    it("produces the same Tundra chunk regardless of generation order", () => {
        const first = controlledTundraGenerator();
        const plainsFirst = first.generate(-1, 0);
        const tundraSecond = first.generate(0, 0);

        const second = controlledTundraGenerator();
        const tundraFirst = second.generate(0, 0);
        const plainsSecond = second.generate(-1, 0);

        expect(plainsFirst).toEqual(plainsSecond);
        expect(tundraSecond).toEqual(tundraFirst);
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

describe("TundraBiome climate matching", () => {
    // Only `matches()` is exercised here, so the moisture field this constructor
    // takes is never sampled - a fixed dummy stands in for the generator's real one.
    const tundra = new TundraBiome(1, new ConstantField("moisture", 0));
    const desert = new DesertBiome(1);
    const forest = new ForestBiome(1);

    it("matches only the extreme cold-and-dry corner", () => {
        expect(tundra.matches({moisture: 0.1, temperature: 0.05})).toBe(true);
    });

    it("does not match hot-and-dry climate that Desert claims", () => {
        expect(tundra.matches({moisture: 0.1, temperature: 0.9})).toBe(false);
        expect(desert.matches({moisture: 0.1, temperature: 0.9})).toBe(true);
    });

    it("does not match cold-and-moist climate that Forest claims", () => {
        expect(tundra.matches({moisture: 0.9, temperature: 0.05})).toBe(false);
        expect(forest.matches({moisture: 0.9, temperature: 0.05})).toBe(true);
    });

    it("matches moderately cold-and-dry climate within its (temporarily loosened) band", () => {
        expect(tundra.matches({moisture: 0.3, temperature: 0.3})).toBe(true);
        expect(desert.matches({moisture: 0.3, temperature: 0.3})).toBe(false);
        expect(forest.matches({moisture: 0.3, temperature: 0.3})).toBe(false);
    });

    // TUNDRA_CONFIG is loosened past the plan's own tight sliver but still
    // stops short of Desert/Forest's own boundaries (see its doc comment),
    // so a real gap remains just outside Tundra's band for Plains to catch.
    it("leaves cool-but-not-quite-Tundra, dry climate to the Plains catch-all", () => {
        expect(tundra.matches({moisture: 0.3, temperature: 0.4})).toBe(false);
        expect(desert.matches({moisture: 0.3, temperature: 0.4})).toBe(false);
        expect(forest.matches({moisture: 0.3, temperature: 0.4})).toBe(false);
    });

    it("never overlaps Desert or Forest, and covers less climate area than either, across a grid", () => {
        const STEP = 0.02;
        let tundraCount = 0;
        let desertCount = 0;
        let forestCount = 0;
        let overlapCount = 0;
        for (let moisture = 0; moisture <= 1; moisture += STEP) {
            for (let temperature = 0; temperature <= 1; temperature += STEP) {
                const climate = {moisture, temperature};
                const isTundra = tundra.matches(climate);
                const isDesert = desert.matches(climate);
                const isForest = forest.matches(climate);
                if (isTundra) {
                    tundraCount++;
                }
                if (isDesert) {
                    desertCount++;
                }
                if (isForest) {
                    forestCount++;
                }
                if (isTundra && (isDesert || isForest)) {
                    overlapCount++;
                }
            }
        }

        expect(overlapCount).toBe(0);
        expect(tundraCount).toBeGreaterThan(0);
        expect(tundraCount).toBeLessThan(desertCount);
        expect(tundraCount).toBeLessThan(forestCount);
    });
});


