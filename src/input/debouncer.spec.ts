import {afterEach, describe, expect, it, vi} from "vitest";
import {Debouncer} from "./debouncer";

afterEach(() => {
    vi.useRealTimers();
});

describe("debouncer", () => {
    it("runs once after delay with latest args", () => {
        vi.useFakeTimers();

        const callback = vi.fn<(value: number) => void>();
        const debouncer = new Debouncer<[number]>(20, callback);

        debouncer.trigger(1);
        debouncer.trigger(2);

        vi.advanceTimersByTime(19);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(2);
    });

    it("resets delay window when trigger is called repeatedly", () => {
        vi.useFakeTimers();

        const callback = vi.fn<() => void>();
        const debouncer = new Debouncer(10, callback);

        debouncer.trigger();
        vi.advanceTimersByTime(9);
        debouncer.trigger();
        vi.advanceTimersByTime(9);

        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("does not run callback after cancel", () => {
        vi.useFakeTimers();

        const callback = vi.fn<() => void>();
        const debouncer = new Debouncer(10, callback);

        debouncer.trigger();
        debouncer.cancel();
        vi.advanceTimersByTime(20);

        expect(callback).not.toHaveBeenCalled();
        expect(debouncer.isScheduled()).toBe(false);
    });

    it("flush runs pending callback immediately", () => {
        vi.useFakeTimers();

        const callback = vi.fn<(value: string) => void>();
        const debouncer = new Debouncer<[string]>(50, callback);

        debouncer.trigger("ready");
        expect(debouncer.isScheduled()).toBe(true);

        debouncer.flush();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith("ready");
        expect(debouncer.isScheduled()).toBe(false);
    });
});


