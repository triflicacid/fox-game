import type {Chunk, ReadableChunk} from "../chunks/chunk";
import {CHUNK_SIZE} from "../chunks/chunk-size";
import {tileToChunk} from "../coordinates/world-grid-math";
import type {FeatureTag} from "../generation/feature/feature-tag";
import type {StructurePieceInstance} from "../generation/structure/structure";
import type {Tile} from "./tile";

/** Grid reads that may trigger chunk generation. */
export interface GeneratingWorldGrid {
    /**
     * Returns the chunk at the given coordinate, requesting/generating it if needed.
     *
     * @param chunkX - Chunk X coordinate, in chunk units.
     * @param chunkY - Chunk Y coordinate, in chunk units.
     * @returns The loaded chunk.
     */
    requestChunk(chunkX: number, chunkY: number): Chunk;

    /**
     * Returns the tile at the given world tile coordinate, requesting its chunk if needed.
     *
     * @param tileX - Tile X coordinate, in tiles from the world origin.
     * @param tileY - Tile Y coordinate, in tiles from the world origin.
     * @returns The tile at that position.
     */
    requestTile(tileX: number, tileY: number): Tile;

    /**
     * Returns the feature tag at the given world tile coordinate, requesting its chunk if needed.
     * Unready chunks report `"none"`.
     *
     * @param tileX - Tile X coordinate, in tiles from the world origin.
     * @param tileY - Tile Y coordinate, in tiles from the world origin.
     * @returns The feature tag at that position, or `"none"` while the chunk is unready.
     */
    requestFeatureTag(tileX: number, tileY: number): FeatureTag;

    /**
     * Returns the structure tag at the given world tile coordinate, requesting its chunk if needed.
     * Unready chunks report `"none"`.
     *
     * @param tileX - Tile X coordinate, in tiles from the world origin.
     * @param tileY - Tile Y coordinate, in tiles from the world origin.
     * @returns The joined structure sprite label at that position, or `"none"` when absent or unready.
     */
    requestStructureTag(tileX: number, tileY: number): string;
}

/** Grid reads that only inspect already loaded/ready chunk state. */
export interface ReadyWorldGrid {
    /**
     * Whether a chunk is already loaded, without triggering generation.
     *
     * @param chunkX - Chunk X coordinate, in chunk units.
     * @param chunkY - Chunk Y coordinate, in chunk units.
     * @returns `true` if the chunk is currently loaded.
     */
    isChunkLoaded(chunkX: number, chunkY: number): boolean;

    /**
     * Returns a chunk only when it is already loaded, without requesting generation.
     *
     * @param chunkX - Chunk X coordinate, in chunk units.
     * @param chunkY - Chunk Y coordinate, in chunk units.
     * @returns The loaded chunk, or `undefined` when absent.
     */
    getLoadedChunk(chunkX: number, chunkY: number): Chunk | undefined;

    /**
     * Returns a tile only when its containing chunk is already loaded and ready.
     *
     * @param tileX - Tile X coordinate, in tiles from the world origin.
     * @param tileY - Tile Y coordinate, in tiles from the world origin.
     * @returns The ready tile, or `undefined` when its chunk is absent or unready.
     */
    getReadyTile(tileX: number, tileY: number): Tile | undefined;

    /**
     * Returns the structure piece occupying a tile only when its containing chunk is already loaded and ready.
     *
     * @param tileX - Tile X coordinate, in tiles from the world origin.
     * @param tileY - Tile Y coordinate, in tiles from the world origin.
     * @returns The ready structure piece at that position, or `undefined` when absent or unready.
     */
    getReadyStructurePieceAt(tileX: number, tileY: number): StructurePieceInstance | undefined;
}

/**
 * Default grid query adapter around one generating chunk callback and one
 * passive chunk lookup callback.
 */
export class DefaultWorldGridView<C extends ReadableChunk = ReadableChunk> implements GeneratingWorldGrid, ReadyWorldGrid {
    /**
     * @param requestChunkCallback - Chunk accessor that may generate/load missing chunks.
     * @param getLoadedChunkCallback - Passive chunk accessor that never generates missing chunks.
     * @param chunkSize - Number of tiles along one chunk edge.
     */
    public constructor(
        private readonly requestChunkCallback: (chunkX: number, chunkY: number) => C,
        private readonly getLoadedChunkCallback: (chunkX: number, chunkY: number) => C | undefined,
        private readonly chunkSize = CHUNK_SIZE,
    ) {}

    public requestChunk(chunkX: number, chunkY: number): C {
        return this.requestChunkCallback(chunkX, chunkY);
    }

    public requestTile(tileX: number, tileY: number): Tile {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY, this.chunkSize);
        const chunk = this.requestChunk(chunkX, chunkY);
        return chunk.getTile(tileX - chunkX * this.chunkSize, tileY - chunkY * this.chunkSize);
    }

    public requestFeatureTag(tileX: number, tileY: number): FeatureTag {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY, this.chunkSize);
        const chunk = this.requestChunk(chunkX, chunkY);
        if (!chunk.isReady()) {
            return "none";
        }
        return chunk.getTile(tileX - chunkX * this.chunkSize, tileY - chunkY * this.chunkSize).featureTag;
    }

    public requestStructureTag(tileX: number, tileY: number): string {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY, this.chunkSize);
        const chunk = this.requestChunk(chunkX, chunkY);
        if (!chunk.isReady()) {
            return "none";
        }
        return chunk.getStructurePieceAt(tileX, tileY)?.sprites.join(", ") ?? "none";
    }

    public isChunkLoaded(chunkX: number, chunkY: number): boolean {
        return this.getLoadedChunk(chunkX, chunkY) !== undefined;
    }

    public getLoadedChunk(chunkX: number, chunkY: number): C | undefined {
        return this.getLoadedChunkCallback(chunkX, chunkY);
    }

    public getReadyTile(tileX: number, tileY: number): Tile | undefined {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY, this.chunkSize);
        const chunk = this.getLoadedChunk(chunkX, chunkY);
        if (!chunk?.isReady()) {
            return undefined;
        }
        return chunk.getTile(tileX - chunkX * this.chunkSize, tileY - chunkY * this.chunkSize);
    }

    public getReadyStructurePieceAt(tileX: number, tileY: number): StructurePieceInstance | undefined {
        const {chunkX, chunkY} = tileToChunk(tileX, tileY, this.chunkSize);
        const chunk = this.getLoadedChunk(chunkX, chunkY);
        if (!chunk?.isReady()) {
            return undefined;
        }
        return chunk.getStructurePieceAt(tileX, tileY);
    }
}



