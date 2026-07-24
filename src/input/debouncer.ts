/**
 * Delays callback execution until there has been no new trigger for the
 * configured interval.
 *
 * Each call to {@link trigger} resets the timer. When the delay elapses, the
 * callback runs once with the latest arguments passed to `trigger`.
 *
 * @typeParam TArgs - tuple type describing callback argument types
 */
export class Debouncer<TArgs extends unknown[] = []> {
    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    private latestArgs: TArgs | null = null;

    /**
     * creates a new debouncer
     *
     * @param delayMs - debounce window in milliseconds
     * @param callback - callback to run after a quiet period
     */
    public constructor(private readonly delayMs: number, private readonly callback: (...args: TArgs) => void) {
        if (delayMs < 0) {
            throw new RangeError("delayMs must be >= 0");
        }
    }

    /**
     * schedules callback execution and resets any pending schedule
     *
     * @param args - latest arguments passed to the callback when it executes
     */
    public trigger(...args: TArgs): void {
        this.latestArgs = args;
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
        }
        this.timeoutId = setTimeout(() => {
            this.timeoutId = null;
            this.executeLatest();
        }, this.delayMs);
    }

    /**
     * cancels a pending execution and forgets pending arguments
     */
    public cancel(): void {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.latestArgs = null;
    }

    /**
     * executes a pending callback immediately, if one is scheduled
     */
    public flush(): void {
        if (this.timeoutId === null) {
            return;
        }
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
        this.executeLatest();
    }

    /**
     * whether a callback execution is currently scheduled
     *
     * @returns true if an execution is pending
     */
    public isScheduled(): boolean {
        return this.timeoutId !== null;
    }

    private executeLatest(): void {
        if (this.latestArgs === null) {
            return;
        }
        const args = this.latestArgs;
        this.latestArgs = null;
        this.callback(...args);
    }
}

