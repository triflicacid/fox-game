import {BackgroundTileType} from "../../../sprites/background-tile-sprite-sheet";

/** Explicit light-to-dark sprite ordering for one biome's base terrain. */
export interface TerrainDepthVariants {
    readonly light: BackgroundTileType;
    readonly medium: BackgroundTileType;
    readonly dark: BackgroundTileType;
}

/** Bounded biome-interior terrain-depth tuning. */
export interface TerrainDepthConfig {
    /** Distance cap and maximum radius that generation explores. */
    readonly maximumDepthTiles: number;
    /** Border rings that are always the light variant. */
    readonly lightOnlyDepthTiles: number;
    /** Maximum contour displacement contributed by variant noise. */
    readonly noisePerturbationTiles: number;
    /** Variant-noise value at or above which a full-depth tile is dark. */
    readonly darkVariantNoiseThreshold: number;
}

/**
 * Default depth tuning. Work per chunk is bounded to a 34x34 biome mask:
 * `(16 + 2 * (8 + 1))²`. Dark terrain starts only at capped depth 8.
 */
export const TERRAIN_DEPTH_CONFIG: TerrainDepthConfig = {
    maximumDepthTiles: 8,
    lightOnlyDepthTiles: 2,
    noisePerturbationTiles: 0.75,
    darkVariantNoiseThreshold: 0.5,
};

/** Throws when terrain-depth tuning cannot produce the three intended bands. */
export function validateTerrainDepthConfig(config: TerrainDepthConfig): void {
    if (!Number.isInteger(config.maximumDepthTiles) || config.maximumDepthTiles < 2) {
        throw new RangeError("maximumDepthTiles must be an integer of at least 2.");
    }
    if (!Number.isInteger(config.lightOnlyDepthTiles)
        || config.lightOnlyDepthTiles < 1
        || config.lightOnlyDepthTiles >= config.maximumDepthTiles) {
        throw new RangeError("lightOnlyDepthTiles must be a positive integer below maximumDepthTiles.");
    }
    if (!Number.isFinite(config.noisePerturbationTiles)
        || config.noisePerturbationTiles < 0
        || config.noisePerturbationTiles >= 1) {
        throw new RangeError("noisePerturbationTiles must be in [0, 1).");
    }
    if (!Number.isFinite(config.darkVariantNoiseThreshold)
        || config.darkVariantNoiseThreshold < 0 || config.darkVariantNoiseThreshold > 1) {
        throw new RangeError("darkVariantNoiseThreshold must be in [0, 1].");
    }
}

/**
 * Selects from explicit light/medium/dark sprites using capped biome depth.
 * Noise softens intermediate contours but can never admit dark terrain early.
 */
export function selectTerrainVariant(
    noise: number,
    depth: number,
    variants: TerrainDepthVariants,
    config: TerrainDepthConfig,
): BackgroundTileType {
    if (depth >= config.maximumDepthTiles) {
        return noise >= config.darkVariantNoiseThreshold ? variants.dark : variants.medium;
    }
    if (depth <= config.lightOnlyDepthTiles) {
        return variants.light;
    }

    const perturbedDepth = depth + (noise - 0.5) * 2 * config.noisePerturbationTiles;
    if (perturbedDepth <= config.lightOnlyDepthTiles) {
        return variants.light;
    }

    const intermediateProgress = (perturbedDepth - config.lightOnlyDepthTiles)
        / (config.maximumDepthTiles - config.lightOnlyDepthTiles);
    return noise <= intermediateProgress ? variants.medium : variants.light;
}


