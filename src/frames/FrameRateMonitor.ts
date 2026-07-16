/**
 * A class to monitor frame rate.
 */
export class FrameRateMonitor {
    private readonly sampleDurationMs: number;
    private frameCount = 0;
    private sampleStartTime = 0;
    private fps = 0;

    public constructor(sampleDurationMs: number) {
        if (sampleDurationMs <= 0) throw new Error('sampleDurationMs must be greater than 0');
        this.sampleDurationMs = sampleDurationMs;
    }

    /**
     * record a frame event at the given timestamp.
     * this is used to adjust the calculated frame rate.
     */
    public recordFrame(timestamp: number) {
        if (this.sampleStartTime === 0) {
            this.sampleStartTime = timestamp;
            this.frameCount = 0;
            return;
        }

        this.frameCount++;

        const elapsed = timestamp - this.sampleStartTime;
        if (elapsed >= this.sampleDurationMs) {
            this.fps = this.frameCount / (elapsed / 1000);
            this.sampleStartTime = timestamp;
            this.frameCount = 0;
        }
    }

    public getFps() {
        return this.fps;
    }

    public reset() {
        this.frameCount = 0;
        this.sampleStartTime = 0;
        this.fps = 0;
    }
}