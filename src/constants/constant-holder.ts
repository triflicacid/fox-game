import { constantRegistry, type ConstantField } from "./constant-registry";

interface Accessor<T = unknown> {
    get(): T;
    set?(value: T): void;
}

/**
 * Options for a field kept as a direct reference to its own property, rather
 * than switching it to an accessor: `readonly` blocks writes through the
 * registry entirely; `min`/`max` bound a numeric field's value on write (see
 * {@link ConstantRegistry.set}).
 */
interface FieldOptionsOverride {
    readonly?: boolean;
    min?: number;
    max?: number;
}

type FieldOverride<T> = Accessor<T> | FieldOptionsOverride;

/**
 * Per-field overrides, keyed by property name. A field with no override
 * registers as a direct, writable reference to `T`'s own property. A field
 * can instead be overridden with an explicit getter/setter pair, or given
 * `{ readonly, min, max }` options to keep the direct reference while
 * constraining writes through the registry. A property that's itself a
 * plain object can be given a nested overrides map instead, addressing its
 * own properties one level down.
 */
export type AccessorOverrides<T> = {
    [K in keyof T]?: T[K] extends Record<string, unknown>
        ? FieldOverride<T[K]> | AccessorOverrides<T[K]>
        : FieldOverride<T[K]>;
};

function isAccessorOverride(override: unknown): override is Accessor {
    return typeof override === "object" && override !== null && typeof (override as { get?: unknown }).get === "function";
}

function isFieldOptionsOverride(override: unknown): override is FieldOptionsOverride {
    if (typeof override !== "object" || override === null) {
        return false;
    }
    const candidate = override as { readonly?: unknown; min?: unknown; max?: unknown };
    return "readonly" in candidate || "min" in candidate || "max" in candidate;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builds one {@link ConstantField} per key of `holder` plus any override-only
 * key in `overrides`, preferring an explicit accessor/readonly override when
 * present. A key whose value is a plain object (and has no such override)
 * recurses instead of becoming a single opaque field, so its own properties
 * are addressable as `${key}.${nestedKey}`.
 *
 * @param holder - The object/class whose own properties become fields.
 * @param overrides - Per-key overrides, possibly nested for object-valued keys.
 * @returns The resulting fields, keyed by (possibly dotted) property path.
 */
function buildFields(
    holder: Record<string, unknown>,
    overrides: Record<string, unknown> | undefined,
): Record<string, ConstantField<unknown>> {
    const fields: Record<string, ConstantField<unknown>> = {};
    const keys = new Set([...Object.keys(holder), ...Object.keys(overrides ?? {})]);
    for (const key of keys) {
        const override = overrides?.[key];
        const value = holder[key];

        if (isAccessorOverride(override)) {
            fields[key] = { kind: "accessor", get: override.get, set: override.set };
        } else if (isFieldOptionsOverride(override)) {
            fields[key] = { kind: "field", holder, key, readonly: override.readonly, min: override.min, max: override.max };
        } else if (isPlainObject(value)) {
            const nestedOverrides = override as Record<string, unknown> | undefined;
            for (const [nestedKey, nestedField] of Object.entries(buildFields(value, nestedOverrides))) {
                fields[`${key}.${nestedKey}`] = nestedField;
            }
        } else {
            fields[key] = { kind: "field", holder, key };
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
    constantRegistry.registerHolder(path, buildFields(obj, overrides as Record<string, unknown> | undefined));
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
        constantRegistry.registerHolder(path, buildFields(target as unknown as Record<string, unknown>, overrides as Record<string, unknown> | undefined));
    };
}
