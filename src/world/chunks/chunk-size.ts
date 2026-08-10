/**
 * Number of tiles along each edge of a chunk. Split into its own module (not
 * declared in `chunk.ts`) so `src/world/features/*` can import it without
 * creating a circular runtime dependency with `Chunk` itself.
 */
export const CHUNK_SIZE = 16;
