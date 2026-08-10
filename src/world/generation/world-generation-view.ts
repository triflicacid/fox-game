import type {BiomeTag} from "./biome/biome";
import type {NoiseField} from "./noise-field";
import type {Structure} from "./structure/structure";
import type {TerrainGenerationSource} from "./terrain-generation-source";

/** Wraps the main-thread terrain source, exposing only the view operations the running world needs. */
export class WorldGenerationView {
    public constructor(private readonly source: TerrainGenerationSource) {}

    /** Propagates a seed change to the underlying source. */
    public setSeed(seed: number): void {
        this.source.setSeed(seed);
    }

    /** Names of every registered noise field. */
    public getFieldNames(): readonly string[] {
        return this.source.getFields().getAll().map(f => f.name);
    }

    /**
     * Samples one noise field at a world tile position.
     * Returns `undefined` when `fieldName` is not registered.
     */
    public getSample(fieldName: string, tileX: number, tileY: number): number | undefined {
        return this.source.getFields().get(fieldName)?.sample(tileX, tileY);
    }

    /** Returns the noise field registered under `name`, or `undefined`. */
    public getField(name: string): NoiseField | undefined {
        return this.source.getFields().get(name);
    }

    /** Resolves the biome at a world tile position. */
    public resolveBiomeTagAt(worldX: number, worldY: number): BiomeTag {
        return this.source.resolveBiomeTagAt(worldX, worldY);
    }

    /** Every structure type placed by generation. */
    public getStructures(): readonly Structure[] {
        return this.source.getStructures();
    }
}

