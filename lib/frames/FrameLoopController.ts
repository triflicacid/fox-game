import {FrameRateLimiter} from './FrameRateLimiter';
import {FrameRateMonitor} from './FrameRateMonitor';

type FrameCallback = (timestamp: DOMHighResTimeStamp) => void;

/**
 * Owns the requestAnimationFrame lifecycle for something that renders over time.
 *
 * This class does not know what a frame means. It only decides when a frame
 * should be run, then calls the supplied callback.
 *
 * This class is responsible for:
 * - starting and stopping the animation loop
 * - scheduling requestAnimationFrame callbacks
 * - applying an optional target FPS limit
 * - measuring the actual rendered FPS
 *
 * The caller is responsible for doing the actual work for each frame.
 */
export class FrameLoopController {
    private readonly onFrame: FrameCallback;
    private readonly limiter: FrameRateLimiter;
    private readonly monitor: FrameRateMonitor;

    private handle: number | undefined = undefined;
    private active = false;

    public constructor(onFrame: FrameCallback, targetFps?: number) {
        this.onFrame = onFrame;
        this.limiter = new FrameRateLimiter(targetFps);
        this.monitor = new FrameRateMonitor(1_000);

        this.loop = this.loop.bind(this);
    }

    /**
     * Start the requestAnimationFrame loop.
     */
    public start() {
        if (this.active) {
            throw new Error('frame loop is already active');
        }

        this.monitor.reset();
        this.limiter.reset();

        this.active = true;
        this.handle = requestAnimationFrame(this.loop);
    }

    /**
     * Stop the requestAnimationFrame loop.
     */
    public stop() {
        this.active = false;

        if (this.handle !== undefined) {
            cancelAnimationFrame(this.handle);
            this.handle = undefined;
        }

        this.limiter.reset();
    }

    /**
     * Return whether this loop is currently running.
     */
    public isActive() {
        return this.active;
    }

    /**
     * Set the desired FPS.
     *
     * Pass `undefined` to remove the FPS cap and run on every available
     * requestAnimationFrame callback.
     */
    public setTargetFps(fps: number | undefined) {
        this.limiter.setTargetFps(fps);
    }

    /**
     * Remove the FPS cap.
     */
    public setUnlimited() {
        this.limiter.setUnlimited();
    }

    /**
     * Return the desired FPS, or undefined when uncapped.
     */
    public getTargetFps() {
        return this.limiter.getTargetFps();
    }

    /**
     * Return the measured FPS (0 when inactive.)
     */
    public getActualFps() {
        return this.active ? this.monitor.getFps() : 0;
    }

    private loop(timestamp: DOMHighResTimeStamp) {
        if (!this.active) {
            return;
        }

        if (this.limiter.shouldRunFrame(timestamp)) {
            this.onFrame(timestamp);
            this.monitor.recordFrame(timestamp);
        }

        this.handle = requestAnimationFrame(this.loop);
    }
}