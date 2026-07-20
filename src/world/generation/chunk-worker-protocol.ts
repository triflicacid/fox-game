import {TileData} from "../tile";

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
    biomeName: string;
    tiles: TileData[][];
    generationTimeMs: number;
}
