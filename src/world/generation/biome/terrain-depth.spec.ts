import {describe, expect, it} from "vitest";
import {
    selectTerrainVariant,
    TERRAIN_DEPTH_CONFIG,
    TerrainDepthConfig,
    validateTerrainDepthConfig,
} from "./terrain-depth";

const VARIANTS = {light: "plains.grass2", medium: "plains.grass1", dark: "plains.grass3"} as const;

describe("selectTerrainVariant", () => {
    it("allows only the explicit light sprite in border rings", () => {
        for (let depth = 0; depth <= TERRAIN_DEPTH_CONFIG.lightOnlyDepthTiles; depth++) {
            expect(selectTerrainVariant(0, depth, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass2");
            expect(selectTerrainVariant(0.999, depth, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass2");
        }
    });

    it("allows light and medium but never dark at intermediate depths", () => {
        const selected = new Set<string>();
        for (let depth = TERRAIN_DEPTH_CONFIG.lightOnlyDepthTiles + 1;
             depth < TERRAIN_DEPTH_CONFIG.maximumDepthTiles;
             depth++) {
            for (const noise of [0, 0.25, 0.5, 0.75, 0.999]) {
                selected.add(selectTerrainVariant(noise, depth, VARIANTS, TERRAIN_DEPTH_CONFIG));
            }
        }
        expect(selected).toEqual(new Set(["plains.grass2", "plains.grass1"]));
        expect(selected).not.toContain("plains.grass3");
    });

    it("allows medium and dark but never light at full interior depth", () => {
        expect(selectTerrainVariant(0, TERRAIN_DEPTH_CONFIG.maximumDepthTiles, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass1");
        expect(selectTerrainVariant(0.999, TERRAIN_DEPTH_CONFIG.maximumDepthTiles, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass3");
    });

    it("uses explicit visual ordering rather than numeric sprite suffixes", () => {
        expect(selectTerrainVariant(0.9, 1, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass2");
        expect(selectTerrainVariant(0.1, 8, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass1");
        expect(selectTerrainVariant(0.9, 8, VARIANTS, TERRAIN_DEPTH_CONFIG)).toBe("plains.grass3");
    });
});

describe("validateTerrainDepthConfig", () => {
    const config = (overrides: Partial<TerrainDepthConfig>): TerrainDepthConfig => ({
        ...TERRAIN_DEPTH_CONFIG,
        ...overrides,
    });

    it("accepts the default tuning", () => {
        expect(() => validateTerrainDepthConfig(TERRAIN_DEPTH_CONFIG)).not.toThrow();
    });

    it("rejects invalid bounds", () => {
        expect(() => validateTerrainDepthConfig(config({maximumDepthTiles: 1}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({maximumDepthTiles: 2.5}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({lightOnlyDepthTiles: 0}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({lightOnlyDepthTiles: 8}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({noisePerturbationTiles: 1}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({noisePerturbationTiles: Number.NaN}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({darkVariantNoiseThreshold: 1.1}))).toThrow(RangeError);
        expect(() => validateTerrainDepthConfig(config({darkVariantNoiseThreshold: Number.NaN}))).toThrow(RangeError);
    });
});

