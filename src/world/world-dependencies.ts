import type {DebugHudRenderer} from "../debug/debug-hud";
import type {MinimapRenderer} from "../minimap/minimap";
import type {MinimapStatsHudRenderer} from "../minimap/minimap-stats-hud";
import type {Chunk} from "./chunk";
import type {ChunkSpriteSheets} from "./chunk-sprite-sheets";
import type {ChunkGenerationWorker} from "./generation/chunk/chunk-generation-worker";
import type {ChunkGenerationResult} from "./generation/chunk/chunk-worker-protocol";
import type {TerrainGenerationSource} from "./generation/terrain-generation-source";
import type {StructureSheetRegistry} from "./structure-sheet-dispatch";

/** Constructs one runtime chunk around an asynchronous generation result. */
export type ChunkFactory = (
    chunkX: number,
    chunkY: number,
    generation: Promise<ChunkGenerationResult>,
    spriteSheets: ChunkSpriteSheets,
    tileSize: number,
) => Chunk;

/** Constructs the shared sprite dependencies used by every runtime chunk. */
export type ChunkSpriteSheetsFactory = (
    structureSheetRegistry: StructureSheetRegistry,
    getStructureCollisionPolygon: ChunkSpriteSheets["getStructureCollisionPolygon"],
) => ChunkSpriteSheets;

/** Complete collaborators required to construct a world. */
export interface WorldDependencies {
    readonly worldSeed: number;
    readonly chunkGenerator: TerrainGenerationSource;
    readonly chunkWorkerClient: ChunkGenerationWorker;
    readonly chunkFactory: ChunkFactory;
    readonly chunkSpriteSheetsFactory: ChunkSpriteSheetsFactory;
    readonly structureSheetRegistry: StructureSheetRegistry;
    readonly debugHud: DebugHudRenderer;
    readonly minimap: MinimapRenderer;
    readonly minimapStatsHud: MinimapStatsHudRenderer;
}

