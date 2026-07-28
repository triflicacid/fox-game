import { fieldRegistry, type AccessorOverrides } from "./field-registry";

/**
 * Class decorator that registers a class's own static fields as tunable
 * fields under `path`, the same way {@link FieldRegistry.registerFields}
 * does for a plain object.
 *
 * @param path - The dotted path this class's static fields live under.
 * @param overrides - Per-field getter/setter overrides, keyed by static field name.
 */
export function FieldHolder<C extends abstract new (...args: never[]) => unknown>(
    path: string,
    overrides?: AccessorOverrides<C>,
) {
    /**
     * Registers `target`'s own static fields under `path` once the class is defined.
     *
     * @param target - The decorated class.
     */
    return function decorate(target: C): void {
        fieldRegistry.registerFields(
            path,
            target as unknown as Record<string, unknown>,
            overrides as AccessorOverrides<Record<string, unknown>> | undefined,
        );
    };
}
