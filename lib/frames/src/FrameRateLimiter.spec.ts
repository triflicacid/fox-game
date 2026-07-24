import {describe, expect, it} from "vitest";
import {FrameRateLimiter} from "./FrameRateLimiter";

describe("FrameRateLimiter", () => {
    it("throws when target FPS is zero or negative", () => {
        expect(() => new FrameRateLimiter(0)).toThrow("target FPS must be greater than 0");
        expect(() => new FrameRateLimiter(-1)).toThrow("target FPS must be greater than 0");
    });

    it("runs every frame when uncapped", () => {
        const limiter = new FrameRateLimiter();

        expect(limiter.getTargetFps()).toBeUndefined();
        expect(limiter.shouldRunFrame(0)).toBe(true);
        expect(limiter.shouldRunFrame(1)).toBe(true);
        expect(limiter.shouldRunFrame(2)).toBe(true);
    });

    it("throttles frames based on target FPS", () => {
        const limiter = new FrameRateLimiter(10);

        expect(limiter.shouldRunFrame(0)).toBe(true);
        expect(limiter.shouldRunFrame(99)).toBe(false);
        expect(limiter.shouldRunFrame(100)).toBe(true);
        expect(limiter.shouldRunFrame(150)).toBe(false);
        expect(limiter.shouldRunFrame(200)).toBe(true);
    });

    it("allows slight timing jitter via tolerance", () => {
        const limiter = new FrameRateLimiter(60);

        expect(limiter.shouldRunFrame(0)).toBe(true);
        expect(limiter.shouldRunFrame(16.3)).toBe(false);
        expect(limiter.shouldRunFrame(16.5)).toBe(true);
    });

    it("resets scheduling when switching to unlimited", () => {
        const limiter = new FrameRateLimiter(10);

        expect(limiter.shouldRunFrame(0)).toBe(true);
        expect(limiter.shouldRunFrame(50)).toBe(false);

        limiter.setUnlimited();

        expect(limiter.getTargetFps()).toBeUndefined();
        expect(limiter.shouldRunFrame(50)).toBe(true);
    });
});

