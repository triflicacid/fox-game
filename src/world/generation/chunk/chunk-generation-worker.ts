import type {ChunkCoordinate} from "../../coordinates/chunk-coordinate";
import type {ChunkGenerationResult} from "./chunk-worker-protocol";

/** Asynchronous chunk-generation operations. */
export interface ChunkGenerationWorker {
    /** Reinitializes generation from a world seed. */
    setSeed(worldSeed: number): void;

    /** Sets the minimum delay between generated chunks. */
    setMinGenerationDelayMs(delayMs: number): void;

    /** Requests one generated chunk. */
    requestChunk(chunkX: number, chunkY: number): Promise<ChunkGenerationResult>;

    /** Cancels every unresolved request. */
    cancelPending(): void;

    /** Returns unresolved chunk coordinates in request order. */
    getPendingChunks(): readonly ChunkCoordinate[];

    /** Reorders unresolved requests by urgency. */
    reorderPending(order: readonly ChunkCoordinate[]): void;

    /** Returns a chunk's unresolved queue position. */
    getQueuePosition(chunkX: number, chunkY: number): number | undefined;

    /** Terminates generation and rejects unresolved requests. */
    terminate(): void;
}

