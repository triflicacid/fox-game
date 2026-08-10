import {DebugHud} from "../debug/debug-hud";
import {Minimap} from "../minimap/minimap";
import {MinimapStatsHud} from "../minimap/minimap-stats-hud";
import {AnimatedBackgroundTileSpriteSheet} from "../sprites/AnimatedBackgroundTileSpriteSheet";
import {BackgroundTileSpriteSheet} from "../sprites/BackgroundTileSpriteSheet";
import {Chunk} from "./chunks/chunk";
import {ChunkGenerator} from "./generation/chunk/chunk-generator";
import {ChunkWorkerClient} from "./generation/chunk/chunk-worker-client";
import {DEFAULT_FEATURE_PROVIDERS} from "./generation/feature/default-features";
import {randomWorldSeed} from "./generation/random-world-seed";
import {buildStructureSheetRegistry} from "./rendering/structure-sheet-dispatch";
import {World} from "./world";
import type {WorldDependencies} from "./world-dependencies";

/** Constructs a world with its production browser collaborators. */
export function createWorld(tileSize: number, worldSeed: number = randomWorldSeed()): World {
    const dependencies: WorldDependencies = {
        worldSeed,
        chunkGenerator: new ChunkGenerator(worldSeed, DEFAULT_FEATURE_PROVIDERS),
        chunkWorkerClient: new ChunkWorkerClient(worldSeed),
        chunkFactory: (chunkX, chunkY, generation, spriteSheets, chunkTileSize) =>
            new Chunk(chunkX, chunkY, generation, spriteSheets, chunkTileSize),
        chunkSpriteSheetsFactory: (structureSheetRegistry, getStructureCollisionPolygon) => ({
            backgroundTile: new BackgroundTileSpriteSheet(),
            animatedBackgroundTile: new AnimatedBackgroundTileSpriteSheet(),
            getStructureSpriteBitmap: (sprite) => structureSheetRegistry.findSheet(sprite).getTileBitmap(sprite),
            getStructureCollisionPolygon,
        }),
        structureSheetRegistry: buildStructureSheetRegistry(),
        debugHud: new DebugHud(),
        minimap: new Minimap(),
        minimapStatsHud: new MinimapStatsHud(),
    };
    return new World(tileSize, dependencies);
}


