import type {DebugHudRenderer} from "../../debug/debug-hud";
import type {MinimapRenderer} from "../../minimap/minimap";
import type {MinimapStatsHudRenderer} from "../../minimap/minimap-stats-hud";
import type {BiomeTag} from "../generation/biome/biome";
import type {ChunkGenerationWorker} from "../generation/chunk/chunk-generation-worker";
import type {ChunkGenerationResult} from "../generation/chunk/chunk-worker-protocol";
import {NoiseFieldRegistry} from "../generation/field-registry";
import type {Structure} from "../generation/structure/structure";
import type {TerrainGenerationSource} from "../generation/terrain-generation-source";
import {Chunk} from "../chunks/chunk";
import type {ChunkCoordinate} from "../coordinates/chunk-coordinate";
import type {ChunkSpriteSheets} from "../rendering/chunk-sprite-sheets";
import type {WorldDependencies} from "../world-dependencies";

/** Browser-free generation source used by world unit tests. */
export class TestTerrainGenerationSource implements TerrainGenerationSource {
    public readonly fields = new NoiseFieldRegistry();
    public readonly seedChanges: number[] = [];

    /** Creates a source initialized to the test seed. */
    public constructor(public seed: number) {}

    /** Records and applies a seed change. */
    public setSeed(worldSeed: number): void {
        this.seed = worldSeed;
        this.seedChanges.push(worldSeed);
    }

    /** Resolves every test coordinate to plains by default. */
    public resolveBiomeTagAt(): BiomeTag {
        return "plains";
    }

    /** Returns no structure definitions by default. */
    public getStructures(): readonly Structure[] {
        return [];
    }

    /** Returns the mutable test field registry. */
    public getFields(): NoiseFieldRegistry {
        return this.fields;
    }
}

/** Browser-free chunk worker used by world unit tests. */
export class TestChunkGenerationWorker implements ChunkGenerationWorker {
    public readonly requests: ChunkCoordinate[] = [];
    public readonly seedChanges: number[] = [];
    public readonly reorderings: ChunkCoordinate[][] = [];
    public minimumDelayMs = 0;
    public cancelCount = 0;
    public terminated = false;

    /** Creates a worker initialized to the test seed. */
    public constructor(public seed: number) {}

    /** Records and applies a seed change. */
    public setSeed(worldSeed: number): void {
        this.seed = worldSeed;
        this.seedChanges.push(worldSeed);
    }

    /** Records the generation delay. */
    public setMinGenerationDelayMs(delayMs: number): void {
        this.minimumDelayMs = delayMs;
    }

    /** Records a request and leaves it pending. */
    public requestChunk(chunkX: number, chunkY: number): Promise<ChunkGenerationResult> {
        this.requests.push({chunkX, chunkY});
        return new Promise(() => undefined);
    }

    /** Records cancellation and clears pending coordinates. */
    public cancelPending(): void {
        this.cancelCount++;
        this.requests.length = 0;
    }

    /** Returns pending coordinates in their current order. */
    public getPendingChunks(): readonly ChunkCoordinate[] {
        return this.requests;
    }

    /** Records and applies a pending request order. */
    public reorderPending(order: readonly ChunkCoordinate[]): void {
        this.reorderings.push([...order]);
        this.requests.splice(0, this.requests.length, ...order);
    }

    /** Returns a pending request's current position. */
    public getQueuePosition(chunkX: number, chunkY: number): number | undefined {
        const position = this.requests.findIndex((coordinate) => coordinate.chunkX === chunkX && coordinate.chunkY === chunkY);
        return position === -1 ? undefined : position;
    }

    /** Records termination. */
    public terminate(): void {
        this.terminated = true;
        this.cancelPending();
    }
}

/** Builds a complete browser-free dependency graph for World tests. */
export function createTestWorldDependencies(
    worldSeed = 1,
    overrides: Partial<Omit<WorldDependencies, "worldSeed">> = {},
): WorldDependencies {
    const generator = new TestTerrainGenerationSource(worldSeed);
    const worker = new TestChunkGenerationWorker(worldSeed);
    const debugHud: DebugHudRenderer = {draw: () => undefined};
    const minimap: MinimapRenderer = {draw: () => undefined};
    const minimapStatsHud: MinimapStatsHudRenderer = {draw: () => undefined};

    return {
        worldSeed,
        chunkGenerator: generator,
        chunkWorkerClient: worker,
        chunkFactory: (chunkX, chunkY, generation, spriteSheets, tileSize) =>
            new Chunk(chunkX, chunkY, generation, spriteSheets, tileSize),
        chunkSpriteSheetsFactory: (_structureSheetRegistry, getStructureCollisionPolygon): ChunkSpriteSheets => ({
            backgroundTile: {} as ChunkSpriteSheets["backgroundTile"],
            animatedBackgroundTile: {} as ChunkSpriteSheets["animatedBackgroundTile"],
            getStructureSpriteBitmap: () => new Promise(() => undefined),
            getStructureCollisionPolygon,
        }),
        structureSheetRegistry: {
            findSheet: () => ({
                getTileBitmap: () => new Promise(() => undefined),
                locateTile: () => {
                    throw new Error("No structure sprites are configured for this test");
                },
            }),
        },
        debugHud,
        minimap,
        minimapStatsHud,
        ...overrides,
    } as WorldDependencies;
}




