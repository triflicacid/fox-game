/**
 * Minimal event-source contract required by {@link Keyboard}.
 */
export interface KeyboardEventSource {
    addEventListener(type: "keydown" | "keyup", listener: (event: KeyboardEvent) => void): void;
    addEventListener(type: "blur", listener: () => void): void;
    removeEventListener(type: "keydown" | "keyup", listener: (event: KeyboardEvent) => void): void;
    removeEventListener(type: "blur", listener: () => void): void;
}

