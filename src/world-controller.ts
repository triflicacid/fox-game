import {World} from "./world/world";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {MovementController} from "./entities/movement-controller";
import {Vector2d} from "./geometry/vector2d";
import {DebugController} from "./debug/debug-controller";
import {FrameLoopController} from "./frames/FrameLoopController";
import {requireNonNull} from "./util";

/**
 * Owns everything needed to run the game against a canvas.
 */
export class WorldController {
    /** Width/height of a single tile, in canvas pixels. */
    private static readonly TILE_SIZE = 32;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly world: World;
    private readonly camera: Camera;
    private readonly movementController: MovementController;
    private readonly debugController: DebugController;
    private readonly frameLoop: FrameLoopController;

    private lastTickTime = 0;

    /**
     * @param canvas - Canvas to render the world into.
     * @param targetFps - FPS to cap rendering at. Defaults to `undefined` (uncapped).
     */
    public constructor(canvas: HTMLCanvasElement, targetFps?: number) {
        this.canvas = canvas;
        this.ctx = requireNonNull(canvas.getContext("2d"));

        this.world = new World(WorldController.TILE_SIZE);
        this.camera = new Camera(Vector2d.ZERO, window.innerWidth, window.innerHeight);
        new CameraDragController(canvas, this.camera);
        this.movementController = new MovementController(this.world.getMainEntity(), {camera: this.camera, mode: "edge"});
        this.debugController = new DebugController();
        this.frameLoop = new FrameLoopController(this.onFrame, targetFps);

        window.addEventListener("resize", this.resize);
        this.resize();
    }

    /**
     * Starts the render loop.
     */
    public start(): void {
        this.lastTickTime = performance.now();
        this.frameLoop.start();
    }

    /**
     * Stops the render loop.
     */
    public stop(): void {
        this.frameLoop.stop();
    }

    /**
     * Returns the configured FPS cap, or `undefined` when uncapped.
     */
    public getTargetFps(): number | undefined {
        return this.frameLoop.getTargetFps();
    }

    /**
     * Sets the FPS cap. Pass `undefined` to render on every available
     * `requestAnimationFrame` callback.
     */
    public setTargetFps(fps: number | undefined): void {
        this.frameLoop.setTargetFps(fps);
    }

    /**
     * Returns the currently measured rendering FPS.
     */
    public getActualFps(): number {
        return this.frameLoop.getActualFps();
    }

    private readonly resize = (): void => {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.camera.setViewportSize(this.canvas.width, this.canvas.height);
        this.draw();
    };

    private readonly onFrame = (now: DOMHighResTimeStamp): void => {
        const deltaMs = now - this.lastTickTime;
        this.lastTickTime = now;
        this.world.update(deltaMs, this.camera);
        this.movementController.update(deltaMs);
        this.draw();
    };

    private draw(): void {
        this.world.draw(
            this.ctx,
            this.camera,
            this.debugController.isEnabled(),
            this.movementController.isSpectating(),
            this.frameLoop.getActualFps(),
            this.frameLoop.getTargetFps(),
        );
    }
}
