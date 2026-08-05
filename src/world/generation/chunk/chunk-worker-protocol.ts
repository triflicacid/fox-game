import {TileData} from "../../tile";
import {BiomeSummary} from "../biome/biome";
import {StructurePieceInstance} from "../structure/structure";

/** A message sent from the main thread to the chunk generation worker. */
export type ChunkGenerationRequest =
    | {type: "init"; worldSeed: number}
    | {type: "generate"; chunkX: number; chunkY: number}
    | {type: "setMinGenerationDelayMs"; delayMs: number}
    | {type: "reorder"; order: {chunkX: number; chunkY: number}[]};

/** The chunk generation worker's response to a `"generate"` request. */
export interface ChunkGenerationResult {
    chunkX: number;
    chunkY: number;
    biomeSummary: BiomeSummary;
    tiles: TileData[][];
    props: StructurePieceInstance[];
    generationTimeMs: number;
}

