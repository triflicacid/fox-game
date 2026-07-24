import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {FrameLoopController} from "./FrameLoopController";

class FakeAnimationFrameScheduler {
    private nextHandle = 1;
    private readonly callbacks = new Map<number, FrameRequestCallback>();

    public readonly requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
        const handle = this.nextHandle++;
        this.callbacks.set(handle, callback);
        return handle;
    });

    public readonly cancelAnimationFrame = vi.fn((handle: number) => {
        this.callbacks.delete(handle);
    });

    public runNext(timestamp: number): void {
        const next = this.callbacks.entries().next();
        if (next.done) {
            throw new Error("no queued animation frame callback");
        }

        const [handle, callback] = next.value;
        this.callbacks.delete(handle);
        callback(timestamp);
    }
}

describe("FrameLoopController", () => {
    let scheduler: FakeAnimationFrameScheduler;

    beforeEach(() => {
        scheduler = new FakeAnimationFrameScheduler();
        vi.stubGlobal("requestAnimationFrame", scheduler.requestAnimationFrame);
        vi.stubGlobal("cancelAnimationFrame", scheduler.cancelAnimationFrame);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("starts and stops the loop", () => {
        const onFrame = vi.fn();
        const loop = new FrameLoopController(onFrame);

        expect(loop.isActive()).toBe(false);
        expect(loop.getActualFps()).toBe(0);

        loop.start();
        expect(loop.isActive()).toBe(true);
        expect(scheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);

        expect(() => loop.start()).toThrow("frame loop is already active");

        loop.stop();
        expect(loop.isActive()).toBe(false);
        expect(scheduler.cancelAnimationFrame).toHaveBeenCalledTimes(1);
        expect(loop.getActualFps()).toBe(0);
    });

    it("respects target FPS when invoking callbacks", () => {
        const onFrame = vi.fn();
        const loop = new FrameLoopController(onFrame, 10);

        loop.start();

        scheduler.runNext(0);
        scheduler.runNext(50);
        scheduler.runNext(100);

        expect(onFrame).toHaveBeenCalledTimes(2);
        expect(onFrame).toHaveBeenNthCalledWith(1, 0);
        expect(onFrame).toHaveBeenNthCalledWith(2, 100);
    });

    it("reports non-zero measured FPS while active after enough samples", () => {
        const loop = new FrameLoopController(() => undefined);

        loop.start();

        for (let timestamp = 0; timestamp <= 1100; timestamp += 100) {
            scheduler.runNext(timestamp);
        }

        expect(loop.getActualFps()).toBeGreaterThan(0);

        loop.stop();
        expect(loop.getActualFps()).toBe(0);
    });

    it("updates target FPS through its public API", () => {
        const loop = new FrameLoopController(() => undefined, 30);

        expect(loop.getTargetFps()).toBe(30);

        loop.setTargetFps(20);
        expect(loop.getTargetFps()).toBe(20);

        loop.setUnlimited();
        expect(loop.getTargetFps()).toBeUndefined();
    });
});

