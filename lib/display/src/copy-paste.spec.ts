import {afterEach, describe, expect, it, vi} from "vitest";
import {copyToClipboard, readFromClipboard} from "./copy-paste";

describe("copy-paste wrappers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forwards copy calls to navigator.clipboard.writeText", () => {
        const writeText = vi.fn();
        Object.defineProperty(globalThis, "navigator", {
            value: {clipboard: {writeText, readText: vi.fn()}},
            configurable: true,
        });

        copyToClipboard("hello");
        expect(writeText).toHaveBeenCalledWith("hello");
    });

    it("forwards read calls to navigator.clipboard.readText", async () => {
        const readText = vi.fn().mockResolvedValue("from-clipboard");
        Object.defineProperty(globalThis, "navigator", {
            value: {clipboard: {writeText: vi.fn(), readText}},
            configurable: true,
        });

        await expect(readFromClipboard()).resolves.toBe("from-clipboard");
        expect(readText).toHaveBeenCalledTimes(1);
    });
});

