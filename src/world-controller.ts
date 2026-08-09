import {World} from "./world/world";
import {ChunkWorkerClient} from "./world/generation/chunk/chunk-worker-client";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {CameraZoomController} from "./camera/camera-zoom-controller";
import {MovementController} from "./entities/movement-controller";
import {Fox} from "./entities/fox";
import {DashEffect, DashEffectRequest} from "./effects/dash-effect";
import {Vector2d} from "./geometry/vector2d";
import {DebugController} from "./debug/debug-controller";
import {HoverTooltip} from "./debug/hover-tooltip";
import {FrameLoopController} from "@frames";
import {requireNonNull} from "./util";
import {HelpController} from "./help/help-controller";
import {KeyBinding} from "./help/key-binding";
import {SettingsController} from "./settings/settings-controller";
import {PopupController} from "@popup";
import {KeyBindingPopupController} from "./popup/key-binding-popup-controller";
import {keyboard} from "./input/keyboard-instance";
import {FOX_CONSTANTS} from './entities/fox-constants';

/**
 * Owns everything needed to run the game against a canvas.
 */
export class WorldController {
    /** Width/height of a single tile, in canvas pixels. */
    private static readonly TILE_SIZE = 16;

    /** Value the settings popup's target-FPS field shows when uncapped (i.e. {@link getTargetFps} returns `undefined`). */
    private static readonly DEFAULT_TARGET_FPS = 60;

    /** FPS the render loop is throttled to while a popup is open, since popups don't need to be responsive. */
    private static readonly POPUP_TARGET_FPS = 20;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly world: World;
    private readonly camera: Camera;
    private readonly cameraZoomController: CameraZoomController;
    private readonly movementController: MovementController;
    private readonly debugController: DebugController;
    private readonly hoverTooltip: HoverTooltip;
    private readonly helpController: HelpController;
    private readonly settingsController: SettingsController;
    private readonly popupControllers: PopupController[];
    private readonly keyBindingPopupControllers: KeyBindingPopupController[];
    private readonly frameLoop: FrameLoopController;

    private lastTickTime = 0;

    /** Whichever popup source is currently open, or `null` if none is. While set, the world is paused and the render loop is throttled. */
    private activePopupController: PopupController | null = null;

    /**
     * A copy of the canvas taken the moment a popup opened.
     */
    private worldSnapshot: OffscreenCanvas | null = null;

    /** The user's configured FPS cap, kept separate from whatever {@link frameLoop} is currently doing so the popup throttle doesn't clobber it. */
    private userTargetFps: number | undefined;

    /** Name of the `NoiseField` currently rendered as a debug heatmap, or `undefined` for none. */
    private noiseFieldName: string | undefined;

    /** Cursor's last known position, in canvas pixels, or `null` while it's outside the canvas - see {@link handleMouseMove}/{@link handleMouseLeave}. Drives the debug hover tooltip. */
    private mousePosition: Vector2d | null = null;

    /**
     * @param canvas - Canvas to render the world into.
     * @param targetFps - FPS to cap rendering at. Defaults to `undefined` (uncapped).
     */
    public constructor(canvas: HTMLCanvasElement, targetFps?: number) {
        this.canvas = canvas;
        this.ctx = requireNonNull(canvas.getContext("2d"));

        const mainEntity = new Fox();
        this.world = new World(WorldController.TILE_SIZE).setMainEntity(mainEntity);
        mainEntity.effectDispatcher.add("dash", (request) => {
            if (request instanceof DashEffectRequest) {
                this.world.registerEffect(new DashEffect(mainEntity, request.position, FOX_CONSTANTS.dash));
            }
        });

        this.camera = new Camera(Vector2d.ZERO, window.innerWidth, window.innerHeight);
        new CameraDragController(canvas, this.camera);
        this.cameraZoomController = new CameraZoomController(canvas, this.camera);
        this.movementController = new MovementController(keyboard, mainEntity, {camera: this.camera, mode: "edge", edgeMargin: 200});
        this.debugController = new DebugController(
            keyboard,
            () => this.world.reloadAllChunks(),
            () => {
                this.movementController.prepareToTeleport();
                this.world.teleportMainEntityTo(this.camera.getCenter());
            },
            () => this.movementController.isSpectating(),
        );
        this.helpController = new HelpController(keyboard, this.handlePopupOpenChange, () => this.getKeyBindings());
        this.settingsController = new SettingsController(
            keyboard,
            this.handlePopupOpenChange,
            () => this.movementController.getCameraFollowMode(),
            (mode) => this.movementController.setCameraFollowMode(mode),
            () => this.movementController.isSpectating(),
            (spectating) => this.movementController.setSpectating(spectating),
            () => this.debugController.isEnabled(),
            (enabled) => this.debugController.setEnabled(enabled),
            () => this.world.getMinimapEnabled(),
            (enabled) => this.world.setMinimapEnabled(enabled),
            () => this.world.isGenerationEnabled(),
            (enabled) => this.world.setGenerationEnabled(enabled),
            () => this.getTargetFps() ?? WorldController.DEFAULT_TARGET_FPS,
            (fps) => this.setTargetFps(fps),
            () => this.world.getNoiseFieldNames(),
            () => this.noiseFieldName,
            (name) => this.noiseFieldName = name,
            () => this.world.getWorldSeed(),
            (seed) => this.world.setWorldSeed(seed),
            () => this.world.refreshWorldSeed(),
        );
        this.hoverTooltip = new HoverTooltip();
        this.popupControllers = [this.helpController, this.settingsController];
        this.keyBindingPopupControllers = [this.helpController, this.settingsController];
        this.userTargetFps = targetFps;
        this.frameLoop = new FrameLoopController(this.onFrame, targetFps);

        canvas.addEventListener("mousemove", this.handleMouseMove);
        canvas.addEventListener("mouseleave", this.handleMouseLeave);
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
     * Returns the user's configured FPS cap, or `undefined` when uncapped.
     * Unaffected by the throttle applied while a popup is open.
     */
    public getTargetFps(): number | undefined {
        return this.userTargetFps;
    }

    /**
     * Sets the user's FPS cap. Pass `undefined` to render on every available
     * `requestAnimationFrame` callback. If a popup is currently open, the
     * loop stays throttled and this cap takes effect once it closes.
     */
    public setTargetFps(fps: number | undefined): void {
        this.userTargetFps = fps;
        if (!this.activePopupController) {
            this.frameLoop.setTargetFps(fps);
        }
    }

    /**
     * Returns the currently measured rendering FPS.
     */
    public getActualFps(): number {
        return this.frameLoop.getActualFps();
    }

    /**
     * The worker client driving chunk generation - for debugging (see
     * `exposeGlobals`).
     */
    public getChunkWorkerClient(): ChunkWorkerClient {
        return this.world.getChunkWorkerClient();
    }

    /**
     * The running game's `World`.
     */
    public getWorld(): World {
        return this.world;
    }

    /** The controller driving the player's movement and camera-follow. */
    public getMovementController(): MovementController {
        return this.movementController;
    }

    /** The controller driving the debug functionality. */
    public getDebugController(): DebugController {
        return this.debugController;
    }

    private readonly handleMouseMove = (event: MouseEvent): void => {
        this.mousePosition = new Vector2d(event.clientX, event.clientY);
    };

    private readonly handleMouseLeave = (): void => {
        this.mousePosition = null;
    };

    private readonly resize = (): void => {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.camera.setViewportSize(this.canvas.width, this.canvas.height);

        if (this.activePopupController) {
            this.repaintWorldSnapshot();
            this.activePopupController.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);
            this.activePopupController.draw(this.ctx, this.canvas.width, this.canvas.height);
            return;
        }

        this.draw();
    };

    /**
     * Runs whenever any popup opens or closes.
     */
    private readonly handlePopupOpenChange = (): void => {
        this.activePopupController = this.popupControllers.find((source) => source.isOpen()) ?? null;
        this.frameLoop.setTargetFps(this.activePopupController ? WorldController.POPUP_TARGET_FPS : this.userTargetFps);

        if (this.activePopupController) {
            this.worldSnapshot = this.captureWorldSnapshot();
            this.activePopupController.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);
            this.activePopupController.draw(this.ctx, this.canvas.width, this.canvas.height);
        } else {
            this.worldSnapshot = null;
        }
    };

    /**
     * Copies the canvas's current pixels into an {@link OffscreenCanvas}.
     */
    private captureWorldSnapshot(): OffscreenCanvas {
        const snapshot = new OffscreenCanvas(this.canvas.width, this.canvas.height);
        requireNonNull(snapshot.getContext("2d")).drawImage(this.canvas, 0, 0);
        return snapshot;
    }

    /** Re-blits the frozen {@link worldSnapshot} over the whole canvas - passed to a popup as its `repaintBackground` hook. */
    private readonly repaintWorldSnapshot = (): void => {
        this.ctx.drawImage(requireNonNull(this.worldSnapshot), 0, 0, this.canvas.width, this.canvas.height);
    };

    private readonly onFrame = (now: DOMHighResTimeStamp): void => {
        const deltaMs = now - this.lastTickTime;
        this.lastTickTime = now;

        if (this.activePopupController) {
            this.activePopupController.draw(this.ctx, this.canvas.width, this.canvas.height, this.repaintWorldSnapshot);
            return;
        }

        this.world.update(deltaMs, this.camera, this.movementController.isSpectating());
        this.movementController.update(deltaMs);
        this.draw();
    };

    /**
     * Repaints the world. Only ever called while no popup is open - see
     * {@link onFrame}/{@link resize}, which paint the popup (and, for
     * {@link resize}, the frozen world snapshot) instead while one is.
     */
    private draw(): void {
        this.world.draw(
            this.ctx,
            this.camera,
            this.debugController.isEnabled(),
            this.debugController.isBordersEnabled(),
            this.debugController.isHitboxesEnabled(),
            this.movementController.isSpectating(),
            this.movementController.getSpectatorVelocity(),
            this.frameLoop.getActualFps(),
            this.frameLoop.getTargetFps(),
            this.noiseFieldName,
        );
        this.drawHoverTooltip();
    }

    /**
     * Draws the cursor-hover tooltip, if debug mode's hover-info toggle is on
     * and the cursor is currently over the canvas.
     */
    private drawHoverTooltip(): void {
        if (!this.debugController.isHoverInfoEnabled() || !this.mousePosition) {
            return;
        }
        const worldPoint = this.camera.screenToWorld(this.mousePosition.x, this.mousePosition.y);
        const tileX = Math.floor(worldPoint.x / WorldController.TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / WorldController.TILE_SIZE);
        const noiseFieldValue = this.noiseFieldName ? this.world.getNoiseFieldSample(this.noiseFieldName, tileX, tileY) : undefined;
        this.hoverTooltip.draw(this.ctx, this.mousePosition.x, this.mousePosition.y, this.canvas.width, this.canvas.height, {
            worldX: worldPoint.x,
            worldY: worldPoint.y,
            tile: this.world.getTileHoverInfo(tileX, tileY),
            entity: this.world.getEntityHoverInfo(worldPoint.x, worldPoint.y),
            noiseField: this.noiseFieldName && noiseFieldValue !== undefined ? {name: this.noiseFieldName, value: noiseFieldValue} : undefined,
        });
    }

    /**
     * Every key binding in the game, gathered from every controller (and the
     * main entity) that exposes one.
     */
    private getKeyBindings(): KeyBinding[] {
        const all = [
            ...this.cameraZoomController.getKeyBindings(),
            ...this.movementController.getKeyBindings(),
            ...this.debugController.getKeyBindings(),
            ...this.keyBindingPopupControllers.flatMap((source) => source.getKeyBindings()),
            ...(this.world.getMainEntity().getKeyBindings?.() ?? []),
        ];
        const seenKeys = new Set<string>();
        return all.filter((binding) => {
            if (seenKeys.has(binding.key)) {
                return false;
            }
            seenKeys.add(binding.key);
            return true;
        });
    }
}
