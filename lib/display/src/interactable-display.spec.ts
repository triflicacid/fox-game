import {beforeEach, describe, expect, it, vi} from "vitest";
import {InteractableDisplay} from "./interactable-display";
import {FLAT_THEME} from "./flat-theme";
import {FocusableElement} from "./interactable-display";

function focusable(x: number, y: number, w: number, h: number): FocusableElement {
    return {rect: {x, y, w, h}, activate: () => undefined, disabled: false};
}

describe("InteractableDisplay basic state and geometry", () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, "window", {
            value: {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
            configurable: true,
        });
    });

    it("tracks active and focused state for always mode", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "always");
        expect(display.isActive()).toBe(false);
        expect(display.isFocused()).toBe(false);

        display.setActive(true);
        expect(display.isActive()).toBe(true);
        expect(display.isFocused()).toBe(true);

        display.setActive(false);
        expect(display.isActive()).toBe(false);
        expect(display.isFocused()).toBe(false);
    });

    it("merges focusables top-down then left-to-right", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "click");
        const merged = display.mergeFocusables(
            [focusable(20, 20, 1, 1), focusable(5, 50, 1, 1)],
            [focusable(10, 20, 1, 1), focusable(1, 10, 1, 1)],
        );

        expect(merged.map((f) => [f.rect.x, f.rect.y])).toEqual([
            [1, 10],
            [10, 20],
            [20, 20],
            [5, 50],
        ]);
    });

    it("computes occupied bounds from focusables", () => {
        const display = new InteractableDisplay({}, FLAT_THEME, "click");
        display.setFocusables([
            focusable(10, 10, 5, 4),
            focusable(20, 7, 3, 2),
        ]);

        expect(display.getOccupiedBounds()).toEqual({x: 10, y: 7, w: 13, h: 7});
    });
});

