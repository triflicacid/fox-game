import {World} from "./world/world";
import {Camera} from "./camera/camera";
import {CameraDragController} from "./camera/camera-drag-controller";
import {MovementController} from "./entities/movement-controller";
import {Vector2d} from "./geometry/vector2d";
import {DebugController} from "./debug/debug-controller";
import {FrameLoopController} from "./frames/FrameLoopController";
import {requireNonNull} from "./util";
import {HelpController} from "./help/help-controller";
import {KeyBinding} from "./help/key-binding";
import {SettingsController} from "./settings/settings-controller";
import {PopupSource} from "./popup/popup-source";

/**
 * Owns everything needed to run the game against a canvas.
 */
export class WorldController {
    /** Width/height of a single tile, in canvas pixels. */
    private static readonly TILE_SIZE = 32;

    /** Value the settings popup's target-FPS field shows when uncapped (i.e. {@link getTargetFps} returns `undefined`). */
    private static readonly DEFAULT_TARGET_FPS = 60;

    /** FPS the render loop is throttled to while a popup is open, since popups don't need to be responsive. */
    private static readonly POPUP_TARGET_FPS = 20;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly world: World;
    private readonly camera: Camera;
    private readonly movementController: MovementController;
    private readonly debugController: DebugController;
    private readonly helpController: HelpController;
    private readonly settingsController: SettingsController;
    private readonly popupSources: PopupSource[];
    private readonly frameLoop: FrameLoopController;

    private lastTickTime = 0;

    /** Whichever popup source is currently open, or `null` if none is. While set, the world is paused and the render loop is throttled. */
    private activePopupSource: PopupSource | null = null;

    /**
     * A copy of the canvas taken the moment a popup opened.
     */
    private worldSnapshot: OffscreenCanvas | null = null;

    /** The user's configured FPS cap, kept separate from whatever {@link frameLoop} is currently doing so the popup throttle doesn't clobber it. */
    private userTargetFps: number | undefined;

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
        this.helpController = new HelpController(() => this.getKeyBindings(), this.handlePopupOpenChange);
        this.settingsController = new SettingsController(
            () => this.movementController.getCameraFollowMode(),
            (mode) => this.movementController.setCameraFollowMode(mode),
            () => this.movementController.isSpectating(),
            (spectating) => this.movementController.setSpectating(spectating),
            () => this.debugController.isEnabled(),
            (enabled) => this.debugController.setEnabled(enabled),
            () => this.getTargetFps() ?? WorldController.DEFAULT_TARGET_FPS,
            (fps) => this.setTargetFps(fps),
            this.handlePopupOpenChange,
        );
        this.popupSources = [this.helpController, this.settingsController];
        this.userTargetFps = targetFps;
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
        if (!this.activePopupSource) {
            this.frameLoop.setTargetFps(fps);
        }
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

        if (this.activePopupSource) {
            this.ctx.drawImage(requireNonNull(this.worldSnapshot), 0, 0, this.canvas.width, this.canvas.height);
            this.activePopupSource.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);
            this.activePopupSource.draw(this.ctx, this.canvas.width, this.canvas.height);
            return;
        }

        this.draw();
    };

    /**
     * Runs whenever any popup opens or closes.
     */
    private readonly handlePopupOpenChange = (): void => {
        this.activePopupSource = this.popupSources.find((source) => source.isOpen()) ?? null;
        this.frameLoop.setTargetFps(this.activePopupSource ? WorldController.POPUP_TARGET_FPS : this.userTargetFps);

        if (this.activePopupSource) {
            this.worldSnapshot = this.captureWorldSnapshot();
            this.activePopupSource.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);
            this.activePopupSource.draw(this.ctx, this.canvas.width, this.canvas.height);
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

    private readonly onFrame = (now: DOMHighResTimeStamp): void => {
        const deltaMs = now - this.lastTickTime;
        this.lastTickTime = now;

        if (this.activePopupSource) {
            this.activePopupSource.draw(this.ctx, this.canvas.width, this.canvas.height);
            return;
        }

        this.world.update(deltaMs, this.camera);
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
            this.movementController.isSpectating(),
            this.frameLoop.getActualFps(),
            this.frameLoop.getTargetFps(),
        );
    }

    /**
     * Every key binding in the game, gathered from every controller (and the
     * main entity) that exposes one, for the help popup to list. Where
     * multiple controllers bind the same key (e.g. `Esc` closing whichever
     * popup is open), only the first one encountered is kept.
     */
    private getKeyBindings(): KeyBinding[] {
        const all = [
            ...this.movementController.getKeyBindings(),
            ...this.debugController.getKeyBindings(),
            ...this.popupSources.flatMap((source) => source.getKeyBindings()),
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
