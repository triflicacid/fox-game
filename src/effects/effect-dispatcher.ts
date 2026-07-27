import {EffectRequest} from "./effect-request";

/** A handler registered via {@link EffectDispatcher.add}. */
export type EffectHandler = (request: EffectRequest) => void;

/** One handler registered via {@link EffectDispatcher.add}, alongside the key it was registered under. */
interface EffectHandlerRegistration {
    key: string;
    handler: EffectHandler;
}

/**
 * A small key-matched pub/sub: handlers register under a string key (e.g.
 * `"dash"`), and a dispatched {@link EffectRequest} reaches every handler
 * whose key it {@link EffectRequest.matches}.
 */
export class EffectDispatcher {
    private readonly registrations: EffectHandlerRegistration[] = [];

    /**
     * Registers `handler` to run for every dispatched request whose
     * {@link EffectRequest.matches} says yes for `key`. Any number of
     * handlers may be registered, including several under the same key.
     *
     * @param key - Effect kind to register for (e.g. `"dash"`).
     * @param handler - Callback to invoke for every matching request.
     */
    public add(key: string, handler: EffectHandler): void {
        this.registrations.push({key, handler});
    }

    /**
     * Unregisters a previously-added handler (see {@link add}). A no-op if
     * it isn't currently registered under `key`.
     *
     * @param key - Effect kind the handler was registered under.
     * @param handler - The exact handler reference to remove.
     */
    public remove(key: string, handler: EffectHandler): void {
        const index = this.registrations.findIndex((registration) => registration.key === key && registration.handler === handler);
        if (index !== -1) {
            this.registrations.splice(index, 1);
        }
    }

    /**
     * Unregisters every currently registered handler.
     */
    public clear(): void {
        this.registrations.length = 0;
    }

    /**
     * Dispatches `request` to every registered handler whose key it
     * {@link EffectRequest.matches}.
     *
     * @param request - The effect request to broadcast.
     */
    public dispatch(request: EffectRequest): void {
        for (const registration of this.registrations) {
            if (request.matches(registration.key)) {
                registration.handler(request);
            }
        }
    }
}
