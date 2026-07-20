import ChunkGenerationWorker from "./chunk-worker?worker&inline";
import {ChunkGenerationRequest, ChunkGenerationResult} from "./chunk-worker-protocol";

/** One pending {@link ChunkWorkerClient.requestChunk} call awaiting its response. */
interface PendingRequest {
    chunkX: number;
    chunkY: number;
    resolve: (result: ChunkGenerationResult) => void;
    reject: (reason: unknown) => void;
}

/**
 * Runs chunk generation on a background Worker, so it doesn't stutter the
 * main thread.
 */
export class ChunkWorkerClient {
    private readonly worker: Worker = new ChunkGenerationWorker();
    private readonly pending = new Map<string, PendingRequest>();

    /**
     * @param worldSeed - The world's seed; every chunk this client requests is generated from it.
     */
    public constructor(worldSeed: number) {
        this.worker.onmessage = (event: MessageEvent<ChunkGenerationResult>) => {
            const result = event.data;
            const key = ChunkWorkerClient.key(result.chunkX, result.chunkY);
            const request = this.pending.get(key);
            if (!request) {
                return;
            }
            this.pending.delete(key);
            request.resolve(result);
        };
        this.worker.onerror = () => {
            this.rejectAllPending(new Error("Chunk generation worker crashed"));
        };

        this.post({type: "init", worldSeed});
    }

    /**
     * Re-initializes the worker's `ChunkGenerator` from a new world seed.
     * Any already-queued (not yet started) requests resolve using the new
     * seed too.
     *
     * @param worldSeed - The new world seed.
     */
    public setSeed(worldSeed: number): void {
        this.post({type: "init", worldSeed});
    }

    /**
     * Sets the debug minimum-delay-between-chunks knob on the worker - see
     * `World.setMinChunkGenerationDelayMs`.
     *
     * @param delayMs - Minimum milliseconds to leave between finishing one chunk's generation and starting the next. `0` disables the delay.
     */
    public setMinGenerationDelayMs(delayMs: number): void {
        this.post({type: "setMinGenerationDelayMs", delayMs});
    }

    /**
     * Builds the key {@link pending} is keyed by for a given chunk coordinate.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns A string uniquely identifying that chunk coordinate.
     */
    private static key(chunkX: number, chunkY: number): string {
        return `${chunkX},${chunkY}`;
    }

    /**
     * Sends a request to the worker.
     *
     * @param request - The request to send.
     */
    private post(request: ChunkGenerationRequest): void {
        this.worker.postMessage(request);
    }

    /**
     * Requests generation of the chunk at the given chunk coordinate.
     *
     * @param chunkX - Chunk's X coordinate, in chunk units.
     * @param chunkY - Chunk's Y coordinate, in chunk units.
     * @returns A promise resolving to the generated chunk once the worker
     * responds, or rejecting if {@link terminate} is called (or the worker
     * crashes) first.
     */
    public requestChunk(chunkX: number, chunkY: number): Promise<ChunkGenerationResult> {
        return new Promise((resolve, reject) => {
            this.pending.set(ChunkWorkerClient.key(chunkX, chunkY), {chunkX, chunkY, resolve, reject});
            this.post({type: "generate", chunkX, chunkY});
        });
    }

    /**
     * Every chunk coordinate currently requested but not yet resolved, in
     * request order - for debugging (see `exposeGlobals`).
     *
     * @returns The pending chunk coordinates.
     */
    public getPendingChunks(): readonly {chunkX: number; chunkY: number}[] {
        return [...this.pending.values()].map(({chunkX, chunkY}) => ({chunkX, chunkY}));
    }

    /**
     * Rejects every still-pending {@link requestChunk} promise with `reason`.
     *
     * @param reason - Rejection reason for every pending promise.
     */
    private rejectAllPending(reason: unknown): void {
        for (const request of this.pending.values()) {
            request.reject(reason);
        }
        this.pending.clear();
    }

    /**
     * Rejects every still-pending {@link requestChunk} promise, without
     * terminating the worker itself.
     */
    public cancelPending(): void {
        this.rejectAllPending(new Error("Chunk generation was cancelled before this chunk finished generating"));
    }

    /**
     * Terminates the underlying worker and rejects every still-pending
     * {@link requestChunk} promise.
     */
    public terminate(): void {
        this.cancelPending();
        this.worker.terminate();
    }
}
