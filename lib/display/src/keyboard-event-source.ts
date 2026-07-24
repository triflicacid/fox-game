/**
 * Minimal keyboard event contract required by {@link InteractableDisplay}.
 *
 * Defined locally so lib/display stays decoupled from lib/keyboard.
 * The browser `Window` type satisfies this interface natively; test doubles
 * can implement only these two methods.
 */
export interface KeyboardEventSource {
    addEventListener(type: "keydown" | "keyup", listener: (event: KeyboardEvent) => void, options?: {capture?: boolean}): void;
    removeEventListener(type: "keydown" | "keyup", listener: (event: KeyboardEvent) => void, options?: {capture?: boolean}): void;
}

