import {BackgroundTileType} from "../../sprites/BackgroundTileSpriteSheet";
import {NoiseField} from "./noise-field";

/**
 * One of the world's biomes . Each biome owns whatever
 * `NoiseField`s its own terrain needs, decides whether it matches the
 * current field values, and samples its own base terrain.
 */
export abstract class Biome {
    /** This biome's stable name. */
    public abstract readonly name: string;

    /**
     * Every `NoiseField` this biome samples from.
     *
     * @returns This biome's fields.
     */
    public abstract getFields(): readonly NoiseField[];

    /**
     * Whether this biome applies given the current field values, tried in
     * order by {@link resolveBiome}.
     *
     * @param fieldValues - Named field values sampled at the position being classified.
     * @returns Whether this biome matches.
     */
    public abstract matches(fieldValues: ReadonlyMap<string, number>): boolean;

    /**
     * Picks a tile's base ground sprite.
     *
     * @param worldX - Tile's X position, in tiles from the world origin.
     * @param worldY - Tile's Y position, in tiles from the world origin.
     * @returns The tile's base ground sprite.
     */
    public abstract sampleBaseTerrain(worldX: number, worldY: number): BackgroundTileType;
}

/**
 * Resolves which biome applies given `fieldValues`, trying `biomes` in order
 * and returning the first match.
 *
 * @param biomes - Ordered biomes; must end with one that always matches.
 * @param fieldValues - Named field values sampled at the position being classified.
 * @returns The matching biome.
 * @throws {Error} If no biome in `biomes` matches.
 */
export function resolveBiome(biomes: readonly Biome[], fieldValues: ReadonlyMap<string, number>): Biome {
    const biome = biomes.find((candidate) => candidate.matches(fieldValues));
    if (!biome) {
        throw new Error("No biome matched - the biome list must end with a catch-all biome.");
    }
    return biome;
}
