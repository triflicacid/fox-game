/**
 * A class to monitor frame rate.
 */
export class FrameRateMonitor {
    private readonly sampleDurationMs: number;
    private frameTimestamps: number[] = [];
    private cachedDeltaSum = 0;
    private fps = 0;

    public constructor(sampleDurationMs: number) {
        if (sampleDurationMs <= 0) throw new Error('sampleDurationMs must be greater than 0');
        this.sampleDurationMs = sampleDurationMs;
    }

    /**
     * record a frame event at the given timestamp.
     * calculated fps based on the average interval between all frames.
     */
    public recordFrame(timestamp: number) {
        this.frameTimestamps.push(timestamp);

        // add the new delta to the cache
        if (this.frameTimestamps.length >= 2) {
            const delta = timestamp - this.frameTimestamps[this.frameTimestamps.length - 2];
            this.cachedDeltaSum += delta;
        }

        // remove frames outside the sample window and subtract their deltas from the cached value
        const windowStart = timestamp - this.sampleDurationMs;
        while (this.frameTimestamps.length > 1 && this.frameTimestamps[0] < windowStart) {
            const delta = this.frameTimestamps[1] - this.frameTimestamps[0];
            this.cachedDeltaSum -= delta;
            this.frameTimestamps.shift();
        }

        // calculate fps from cached average interval
        if (this.frameTimestamps.length >= 2) {
            const averageIntervalMs = this.cachedDeltaSum / (this.frameTimestamps.length + 1);
            if (averageIntervalMs > 0) {
                this.fps = 1000 / averageIntervalMs;
            }
        }
    }

    public getFps() {
        return this.fps;
    }

    public reset() {
        this.frameTimestamps.length = 0;
        this.cachedDeltaSum = 0;
        this.fps = 0;
    }
}