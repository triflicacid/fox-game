import { registerHolder, type ConstantField } from "./constant-registry";

interface Accessor<T = unknown> {
    get(): T;
    set?(value: T): void;
}

/** Marks a field readonly while keeping it a direct reference to its own property, rather than switching it to an accessor. */
interface ReadonlyOverride {
    readonly: true;
}

type FieldOverride<T> = Accessor<T> | ReadonlyOverride;

/**
 * Per-field overrides, keyed by property name. A field with no override
 * registers as a direct, writable reference to `T`'s own property. A field
 * can instead be overridden with an explicit getter/setter pair, or marked
 * `{ readonly: true }` to keep the direct reference but block writes through
 * the registry.
 */
export type AccessorOverrides<T> = { [K in keyof T]?: FieldOverride<T[K]> };

function isReadonlyOverride(override: FieldOverride<unknown>): override is ReadonlyOverride {
    return !("get" in override);
}

/**
 * Builds one {@link ConstantField} per key of `holder` plus any override-only
 * key in `overrides`, preferring the override when both exist.
 *
 * @param holder - The object/class whose own properties become fields.
 * @param overrides - Per-key overrides.
 * @returns The resulting fields, keyed by property name.
 */
function buildFields(
    holder: Record<string, unknown>,
    overrides: Record<string, FieldOverride<unknown>> | undefined,
): Record<string, ConstantField<unknown>> {
    const fields: Record<string, ConstantField<unknown>> = {};
    const keys = new Set([...Object.keys(holder), ...Object.keys(overrides ?? {})]);
    for (const key of keys) {
        const override = overrides?.[key];
        if (!override) {
            fields[key] = { kind: "field", holder, key };
        } else if (isReadonlyOverride(override)) {
            fields[key] = { kind: "field", holder, key, readonly: true };
        } else {
            fields[key] = { kind: "accessor", get: override.get, set: override.set };
        }
    }
    return fields;
}

/**
 * Registers a plain object's own properties as tunable constants under
 * `path`. Each key becomes addressable as `${path}.${key}`, reading and
 * writing the exact same property `obj` already exposes - unless
 * `overrides` supplies an explicit getter/setter for that key, in which case
 * the override is used instead of a direct field reference.
 *
 * @param path - The dotted path this object's fields live under.
 * @param obj - The plain object whose own properties become tunable.
 * @param overrides - Per-field getter/setter overrides, keyed by property name.
 */
export function registerConstants<T extends Record<string, unknown>>(
    path: string,
    obj: T,
    overrides?: AccessorOverrides<T>,
): void {
    registerHolder(path, buildFields(obj, overrides as Record<string, FieldOverride<unknown>> | undefined));
}

/**
 * Class decorator that registers a class's own static fields as tunable
 * constants under `path`, the same way {@link registerConstants} does for a
 * plain object.
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
        registerHolder(path, buildFields(target as unknown as Record<string, unknown>, overrides as Record<string, FieldOverride<unknown>> | undefined));
    };
}
