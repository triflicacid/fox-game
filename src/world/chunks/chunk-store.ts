import {CoordMap} from "../coordinates/coord-set";
import type {Chunk} from "./chunk";

/** Read-only view over loaded chunks: passive lookups only, never triggers generation. */
export interface ReadonlyChunkStore<C extends Chunk = Chunk> {
    /** Number of chunks currently loaded. */
    readonly size: number;

    /** Whether a chunk is loaded at `(chunkX, chunkY)`. */
    has(chunkX: number, chunkY: number): boolean;

    /** Returns the loaded chunk at `(chunkX, chunkY)`, or `undefined` when absent. */
    get(chunkX: number, chunkY: number): C | undefined;

    /** Iterates over every loaded chunk. */
    values(): IterableIterator<C>;

    /** Count of loaded chunks that haven't finished generating yet. */
    getGeneratingCount(): number;
}

/** A store of currently loaded chunks. */
export class ChunkStore<C extends Chunk = Chunk> implements ReadonlyChunkStore<C> {
    private readonly chunks = new CoordMap<C>();

    /** Number of chunks currently loaded. */
    public get size(): number {
        return this.chunks.size;
    }

    /** Whether a chunk is loaded at `(chunkX, chunkY)`. */
    public has(chunkX: number, chunkY: number): boolean {
        return this.chunks.has(chunkX, chunkY);
    }

    /** Returns the loaded chunk at `(chunkX, chunkY)`, or `undefined` when absent. */
    public get(chunkX: number, chunkY: number): C | undefined {
        return this.chunks.get(chunkX, chunkY);
    }

    /** Stores `chunk` at `(chunkX, chunkY)`, overwriting any existing entry. */
    public set(chunkX: number, chunkY: number, chunk: C): void {
        this.chunks.set(chunkX, chunkY, chunk);
    }

    /** Drops the chunk at `(chunkX, chunkY)`. Safe to call when it isn't loaded. */
    public remove(chunkX: number, chunkY: number): void {
        this.chunks.delete(chunkX, chunkY);
    }

    /** Drops every loaded chunk. */
    public clear(): void {
        this.chunks.clear();
    }

    /** Iterates over every loaded chunk. */
    public values(): IterableIterator<C> {
        return this.chunks.values();
    }

    /** Count of loaded chunks that haven't finished generating yet. */
    public getGeneratingCount(): number {
        let count = 0;
        for (const chunk of this.chunks.values()) {
            if (!chunk.isReady()) {
                count++;
            }
        }
        return count;
    }
}
