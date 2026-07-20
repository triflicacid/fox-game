import {ChunkGenerator} from "./chunk-generator";
import {ChunkGenerationRequest, ChunkGenerationResult} from "./chunk-worker-protocol";

/**
 * Narrow view of the worker global scope this file needs. Avoids adding the
 * `WebWorker` lib to `tsconfig.json`, which conflicts with the `DOM` lib
 * already used elsewhere in the project (both declare an incompatible
 * global `self`).
 */
const ctx = self as unknown as {
    postMessage(message: ChunkGenerationResult): void;
    onmessage: ((event: MessageEvent<ChunkGenerationRequest>) => void) | null;
};

let generator: ChunkGenerator | null = null;

/**
 * Minimum time to leave between finishing one chunk's generation and
 * starting the next - a debug knob (see the settings dialog's "Chunk
 * generation" section) to simulate slow generation without blocking the
 * main thread. `0` (the default) generates as fast as possible.
 */
let minGenerationDelayMs = 0;

/** Chunk coordinates awaiting generation, processed one at a time by {@link processQueue}. */
const queue: {chunkX: number; chunkY: number}[] = [];
let queueRunning = false;
let lastGenerationEndMs = 0;

/**
 * Generates one chunk and posts its result back to the main thread.
 *
 * @param chunkX - Chunk's X coordinate, in chunk units.
 * @param chunkY - Chunk's Y coordinate, in chunk units.
 * @throws {Error} If called before an `"init"` request has been received.
 */
function generateChunk(chunkX: number, chunkY: number): void {
    if (!generator) {
        throw new Error("Chunk worker received a \"generate\" request before \"init\"");
    }

    const start = performance.now();
    const generated = generator.generate(chunkX, chunkY);
    const generationTimeMs = performance.now() - start;
    lastGenerationEndMs = performance.now();

    ctx.postMessage({
        chunkX,
        chunkY,
        biomeName: generated.biome.name,
        tiles: generated.tiles,
        generationTimeMs,
    });
}

/**
 * Drains {@link queue} one chunk at a time, waiting between chunks so at
 * least {@link minGenerationDelayMs} elapses since the previous chunk
 * finished. Safe to call while already running - only one drain loop is
 * ever active.
 */
async function processQueue(): Promise<void> {
    if (queueRunning) {
        return;
    }
    queueRunning = true;

    while (queue.length > 0) {
        const waitMs = minGenerationDelayMs - (performance.now() - lastGenerationEndMs);
        if (waitMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }

        const next = queue.shift();
        if (next) {
            generateChunk(next.chunkX, next.chunkY);
        }
    }

    queueRunning = false;
}

/**
 * Re-sorts {@link queue} to match `order`. Whichever chunk is currently
 * being generated has already been shifted out of {@link queue} (see
 * {@link processQueue}), so it's unaffected regardless of where it falls
 * in `order`.
 *
 * @param order - Desired chunk coordinate order, most urgent first. A queued coordinate missing from `order` sorts last.
 */
function reorderQueue(order: {chunkX: number; chunkY: number}[]): void {
    const rank = new Map<string, number>();
    order.forEach(({chunkX, chunkY}, index) => rank.set(`${chunkX},${chunkY}`, index));
    queue.sort((a, b) => (rank.get(`${a.chunkX},${a.chunkY}`) ?? Infinity) - (rank.get(`${b.chunkX},${b.chunkY}`) ?? Infinity));
}

ctx.onmessage = (event) => {
    const request = event.data;

    if (request.type === "init") {
        generator = new ChunkGenerator(request.worldSeed);
        return;
    }

    if (request.type === "setMinGenerationDelayMs") {
        minGenerationDelayMs = request.delayMs;
        return;
    }

    if (request.type === "reorder") {
        reorderQueue(request.order);
        return;
    }

    queue.push({chunkX: request.chunkX, chunkY: request.chunkY});
    void processQueue();
};
