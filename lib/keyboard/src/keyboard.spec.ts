import {describe, expect, it, vi} from "vitest";
import {Keyboard} from "./keyboard";
import type {KeyboardEventSource} from "./keyboard-event-source";

type KeyHandler = (event: KeyboardEvent) => void;
type BlurHandler = () => void;

class FakeWindow implements KeyboardEventSource {
    private readonly keyListeners = new Map<"keydown" | "keyup", Set<KeyHandler>>();
    private readonly blurListeners = new Set<BlurHandler>();

    public addEventListener(type: "keydown" | "keyup", listener: KeyHandler): void;
    public addEventListener(type: "blur", listener: BlurHandler): void;
    public addEventListener(type: "keydown" | "keyup" | "blur", listener: KeyHandler | BlurHandler): void {
        if (type === "blur") {
            this.blurListeners.add(listener as BlurHandler);
            return;
        }
        const handlers = this.keyListeners.get(type) ?? new Set<KeyHandler>();
        handlers.add(listener as KeyHandler);
        this.keyListeners.set(type, handlers);
    }

    public removeEventListener(type: "keydown" | "keyup", listener: KeyHandler): void;
    public removeEventListener(type: "blur", listener: BlurHandler): void;
    public removeEventListener(type: "keydown" | "keyup" | "blur", listener: KeyHandler | BlurHandler): void {
        if (type === "blur") {
            this.blurListeners.delete(listener as BlurHandler);
            return;
        }
        this.keyListeners.get(type)?.delete(listener as KeyHandler);
    }

    public dispatch(type: string, key = ""): void {
        if (type === "blur") {
            for (const listener of this.blurListeners) {
                listener();
            }
            return;
        }
        const event = {key} as KeyboardEvent;
        const keyType = type as "keydown" | "keyup";
        for (const listener of this.keyListeners.get(keyType) ?? []) {
            listener(event);
        }
    }
}

describe("keyboard", () => {
    it("tracks pressed keys with case-sensitive matching by default", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);

        fakeWindow.dispatch("keydown", "W");
        expect(keyboard.hasKeyPressed("W")).toBe(true);
        expect(keyboard.hasKeyPressed("w")).toBe(false);
        expect(keyboard.hasKeyPressed("w", {caseInsensitive: true})).toBe(true);

        fakeWindow.dispatch("keyup", "W");
        expect(keyboard.hasKeyPressed("W")).toBe(false);
    });

    it("notifies keydown listeners and supports unsubscription", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);
        const listener = vi.fn();

        const unsubscribe = keyboard.onKeyDown(listener);
        fakeWindow.dispatch("keydown", "A");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({key: "A"}), "A");

        unsubscribe();
        fakeWindow.dispatch("keydown", "A");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("uses case-sensitive matching by default for key-specific listeners", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);
        const fListener = vi.fn();

        keyboard.onKeyDownForKey("f", fListener);
        fakeWindow.dispatch("keydown", "F");
        fakeWindow.dispatch("keydown", "f");
        fakeWindow.dispatch("keydown", "G");

        expect(fListener).toHaveBeenCalledTimes(1);
        expect(fListener).toHaveBeenLastCalledWith(expect.objectContaining({key: "f"}), "f");
    });

    it("can use case-insensitive matching for key-specific listeners", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);
        const dListener = vi.fn();

        keyboard.onKeyDownForKey("d", dListener, {caseInsensitive: true});
        fakeWindow.dispatch("keydown", "d");
        fakeWindow.dispatch("keydown", "D");

        expect(dListener).toHaveBeenCalledTimes(2);
    });

    it("notifies keyup listeners and supports unsubscription", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);
        const listener = vi.fn();

        const unsubscribe = keyboard.onKeyUp(listener);
        fakeWindow.dispatch("keydown", "ArrowUp");
        fakeWindow.dispatch("keyup", "ArrowUp");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({key: "ArrowUp"}), "ArrowUp");

        unsubscribe();
        fakeWindow.dispatch("keyup", "ArrowUp");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("clears pressed key state on blur", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);

        fakeWindow.dispatch("keydown", "ArrowUp");
        expect(keyboard.hasKeyPressed("ArrowUp")).toBe(true);

        fakeWindow.dispatch("blur");
        expect(keyboard.hasKeyPressed("ArrowUp")).toBe(false);
        expect(Array.from(keyboard.getPressedKeys())).toHaveLength(0);
    });

    it("dispose detaches listeners and clears tracked state", () => {
        const fakeWindow = new FakeWindow();
        const keyboard = new Keyboard(fakeWindow);
        const listener = vi.fn();

        keyboard.onKeyDown(listener);
        fakeWindow.dispatch("keydown", "x");
        expect(listener).toHaveBeenCalledTimes(1);

        keyboard.dispose();
        fakeWindow.dispatch("keydown", "x");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(keyboard.hasKeyPressed("x")).toBe(false);
    });
});




