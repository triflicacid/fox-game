/**
 * Controls whether a frame should be rendered based on a target FPS.
 */
export class FrameRateLimiter {
    // a small tolerance to correct for requestAnimationFrames slight intervals
    // example: if target=60, actual=~40 but when target=65, actual=~60
    // due to interval=16.66...ms not playing nice
    private static readonly FRAME_TOLERANCE_MS = 0.25;

    private targetFps: number | undefined;
    private frameIntervalMs = 0;
    private nextFrameTime = 0;

    public constructor(targetFps?: number) {
        this.setTargetFps(targetFps);
    }

    /**
     * set the desired frame rate.
     * pass `undefined` for an unlimited frame rate
     * (i.e., to allow every requestAnimationFrame callback to render.)
     */
    public setTargetFps(fps: number | undefined) {
        if (fps !== undefined && fps <= 0) {
            throw new Error('target FPS must be greater than 0');
        }

        this.targetFps = fps;
        this.frameIntervalMs = fps === undefined ? 0 : 1000 / fps;
        this.reset();
    }

    /**
     * lift the limit, i.e., make it unlimited.
     */
    public setUnlimited() {
        this.targetFps = undefined;
        this.frameIntervalMs = 0;
        this.reset();
    }

    /**
     * get the currently configured target frame rate,
     * where `undefined` means unlimited.
     */
    public getTargetFps() {
        return this.targetFps;
    }

    /**
     * reset frame timing.
     */
    public reset() {
        this.nextFrameTime = 0;
    }

    /**
     * return true when enough time has passed to render another frame.
     * this sets the latest frame run to the given timestamp.
     */
    public shouldRunFrame(timestamp: number) {
        if (this.frameIntervalMs === 0) {
            return true;
        }

        if (this.nextFrameTime === 0) {
            this.setNextFrameTime(timestamp);
            return true;
        }

        if (timestamp + FrameRateLimiter.FRAME_TOLERANCE_MS < this.nextFrameTime) {
            return false;
        }

        this.nextFrameTime += this.frameIntervalMs;

        if (timestamp > this.nextFrameTime) {
            this.setNextFrameTime(timestamp);
        }

        return true;
    }

    private setNextFrameTime(timestamp: number) {
        this.nextFrameTime = timestamp + this.frameIntervalMs;
    }
}