import { constantRegistry, type AccessorOverrides } from "./constant-registry";

/**
 * Class decorator that registers a class's own static fields as tunable
 * constants under `path`, the same way {@link ConstantRegistry.registerConstants}
 * does for a plain object.
 *
 * @param path - The dotted path this class's static fields live under.
 * @param overrides - Per-field getter/setter overrides, keyed by static field name.
 */
export function ConstantHolder<C extends abstract new (...args: never[]) => unknown>(
    path: string,
    overrides?: AccessorOverrides<C>,
) {
    /**
     * Registers `target`'s own static fields under `path` once the class is defined.
     *
     * @param target - The decorated class.
     */
    return function decorate(target: C): void {
        constantRegistry.registerConstants(
            path,
            target as unknown as Record<string, unknown>,
            overrides as AccessorOverrides<Record<string, unknown>> | undefined,
        );
    };
}
