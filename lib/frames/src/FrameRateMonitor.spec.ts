import {describe, expect, it} from "vitest";
import {FrameRateMonitor} from "./FrameRateMonitor";

describe("FrameRateMonitor", () => {
    it("throws when sample duration is zero or negative", () => {
        expect(() => new FrameRateMonitor(0)).toThrow("sampleDurationMs must be greater than 0");
        expect(() => new FrameRateMonitor(-10)).toThrow("sampleDurationMs must be greater than 0");
    });

    it("computes FPS from average frame interval", () => {
        const monitor = new FrameRateMonitor(1000);

        monitor.recordFrame(0);
        monitor.recordFrame(100);
        monitor.recordFrame(200);
        monitor.recordFrame(300);

        expect(monitor.getFps()).toBeCloseTo(10, 6);
    });

    it("drops timestamps outside the sample window", () => {
        const monitor = new FrameRateMonitor(200);

        monitor.recordFrame(0);
        monitor.recordFrame(10);
        monitor.recordFrame(110);
        monitor.recordFrame(210);

        // At t=210, window starts at 10 so timestamp 0 is evicted.
        // Remaining intervals are 100ms and 100ms => 10 FPS.
        expect(monitor.getFps()).toBeCloseTo(10, 6);
    });

    it("resets accumulated state", () => {
        const monitor = new FrameRateMonitor(1000);

        monitor.recordFrame(0);
        monitor.recordFrame(100);
        monitor.recordFrame(200);
        expect(monitor.getFps()).toBeGreaterThan(0);

        monitor.reset();

        expect(monitor.getFps()).toBe(0);
    });
});

