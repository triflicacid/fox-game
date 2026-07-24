import type {KeyboardEventSource} from "./keyboard-event-source";

/**
 * callback notified on each keydown event observed by {@link Keyboard}
 *
 * @param event - original keyboard event
 * @param key - key value from `KeyboardEvent.key`
 */
export type KeyboardKeyDownListener = (event: KeyboardEvent, key: string) => void;

/**
 * Configures how key matching is performed for queries and subscriptions.
 */
export interface KeyboardKeyMatchOptions {
    /**
     * when true, single-character keys are compared case-insensitively
     */
    caseInsensitive?: boolean;
}

interface KeyDownSubscription {
    key: string;
    listener: KeyboardKeyDownListener;
    caseInsensitive: boolean;
}

/**
 * Tracks keyboard state from window events and exposes query/subscription APIs.
 *
 * Key matching is case-sensitive by default. Consumers can opt into
 * case-insensitive single-character matching where needed.
 */
export class Keyboard {
    private readonly pressedKeys = new Set<string>();
    private readonly keyDownListeners = new Set<KeyboardKeyDownListener>();
    private readonly keyUpListeners = new Set<KeyboardKeyDownListener>();
    private readonly keyDownSubscriptions = new Set<KeyDownSubscription>();
    private readonly eventSource: KeyboardEventSource;

    /**
     * creates a keyboard tracker and starts listening to window key events
     *
     * @param eventSource - event source to attach listeners to; defaults to global window
     */
    public constructor(eventSource: KeyboardEventSource) {
        this.eventSource = eventSource;
        this.eventSource.addEventListener("keydown", this.handleWindowKeyDown);
        this.eventSource.addEventListener("keyup", this.handleWindowKeyUp);
        this.eventSource.addEventListener("blur", this.handleWindowBlur);
    }

    /**
     * checks whether a key is currently pressed
     *
     * @param key - key name to query (same shape as `KeyboardEvent.key`)
     * @param options - optional key matching behaviour
     * @returns true when the key is currently held
     */
    public hasKeyPressed(key: string, options: KeyboardKeyMatchOptions = {}): boolean {
        const caseInsensitive = options.caseInsensitive ?? false;
        if (!caseInsensitive) {
            return this.pressedKeys.has(key);
        }
        for (const pressedKey of this.pressedKeys) {
            if (Keyboard.matchesKey(pressedKey, key, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * clears all tracked pressed keys
     *
     * useful when focus is lost, input mode changes, or controls are reset
     */
    public clear(): void {
        this.pressedKeys.clear();
    }

    /**
     * registers a listener for every keydown event
     *
     * @param listener - listener to notify
     * @returns cleanup callback that unregisters the listener
     */
    public onKeyDown(listener: KeyboardKeyDownListener): () => void {
        this.keyDownListeners.add(listener);
        return () => {
            this.keyDownListeners.delete(listener);
        };
    }

    /**
     * registers a listener for every keyup event
     *
     * @param listener - listener to notify
     * @returns cleanup callback that unregisters the listener
     */
    public onKeyUp(listener: KeyboardKeyDownListener): () => void {
        this.keyUpListeners.add(listener);
        return () => {
            this.keyUpListeners.delete(listener);
        };
    }

    /**
     * registers a listener for keydown events of one specific key
     *
     * @param key - key to watch (same shape as `KeyboardEvent.key`)
     * @param listener - listener to notify when the key is pressed
     * @param options - optional key matching behaviour
     * @returns cleanup callback that unregisters the listener
     */
    public onKeyDownForKey(key: string, listener: KeyboardKeyDownListener, options: KeyboardKeyMatchOptions = {}): () => void {
        const subscription: KeyDownSubscription = {
            key,
            listener,
            caseInsensitive: options.caseInsensitive ?? false,
        };
        this.keyDownSubscriptions.add(subscription);

        return () => {
            this.keyDownSubscriptions.delete(subscription);
        };
    }

    /**
     * removes window listeners and clears all tracked state/subscriptions
     */
    public dispose(): void {
        this.eventSource.removeEventListener("keydown", this.handleWindowKeyDown);
        this.eventSource.removeEventListener("keyup", this.handleWindowKeyUp);
        this.eventSource.removeEventListener("blur", this.handleWindowBlur);
        this.pressedKeys.clear();
        this.keyDownListeners.clear();
        this.keyUpListeners.clear();
        this.keyDownSubscriptions.clear();
    }

    /**
     * snapshot of currently pressed keys
     *
     * @returns a new readonly set of keys that are currently held
     */
    public getPressedKeys(): ReadonlySet<string> {
        return new Set(this.pressedKeys);
    }

    private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
        const key = event.key;
        this.pressedKeys.add(key);

        for (const listener of this.keyDownListeners) {
            listener(event, key);
        }

        for (const subscription of this.keyDownSubscriptions) {
            if (!Keyboard.matchesKey(key, subscription.key, subscription.caseInsensitive)) {
                continue;
            }
            subscription.listener(event, key);
        }
    };

    private readonly handleWindowKeyUp = (event: KeyboardEvent): void => {
        this.pressedKeys.delete(event.key);
        const key = event.key;
        for (const listener of this.keyUpListeners) {
            listener(event, key);
        }
    };

    private readonly handleWindowBlur = (): void => {
        // clear pressed state to avoid stuck keys when window focus changes
        this.clear();
    };

    /**
     * compares two key values using either exact or case-insensitive matching
     * for single-character keys
     *
     * @param left - key value to compare
     * @param right - key value to compare
     * @param caseInsensitive - whether case-insensitive matching is enabled
     * @returns true when keys match under the requested mode
     */
    private static matchesKey(left: string, right: string, caseInsensitive: boolean): boolean {
        if (!caseInsensitive) {
            return left === right;
        }
        if (left.length === 1 && right.length === 1) {
            return left.toLowerCase() === right.toLowerCase();
        }
        return left === right;
    }
}



