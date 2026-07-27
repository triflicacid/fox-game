import type { ConstantsSchema, DotPath, ValueAt } from "./constants-schema";

/**
 * An explicit getter/setter pair overriding a field's default direct-property
 * registration, for a value that needs a side effect on write (or that's
 * exposed read-only by omitting `set`).
 */
interface Accessor<T = unknown> {
    /** Reads the field's current value. */
    get(): T;
    /** Writes a new value to the field. Omit to expose the field as read-only. */
    set?(value: T): void;
    /**
     * Validates a value just before it's written, rejecting it with a string
     * reason or allowing it by returning nothing (see {@link ConstantRegistry.set}).
     */
    capture?(value: T): string | undefined;
}

/**
 * Options for a field kept as a direct reference to its own property, rather
 * than switching it to an accessor.
 */
interface FieldOptionsOverride<T> {
    readonly?: boolean;
    capture?(value: T): string | undefined;
}

type FieldOverride<T> = Accessor<T> | FieldOptionsOverride<T> | ((value: T) => string | undefined);

/**
 * Per-field overrides, keyed by property name. A field with no override
 * registers as a direct, writable reference to `T`'s own property. A field
 * can instead be overridden with an explicit getter/setter pair, given
 * `{ readonly, capture }` options to keep the direct reference while
 * constraining writes through the registry, or - if only a `capture` is
 * needed - a bare capture function as shorthand for `{ capture }`. A
 * property that's itself a plain object can be given a nested overrides map
 * instead, addressing its own properties one level down.
 */
export type AccessorOverrides<T> = {
    [K in keyof T]?: T[K] extends Record<string, unknown>
        ? FieldOverride<T[K]> | AccessorOverrides<T[K]>
        : FieldOverride<T[K]>;
};

function isAccessorOverride(override: unknown): override is Accessor {
    return typeof override === "object" && override !== null && typeof (override as { get?: unknown }).get === "function";
}

function isCaptureOverride(override: unknown): override is (value: unknown) => string | undefined {
    return typeof override === "function";
}

function isFieldOptionsOverride(override: unknown): override is FieldOptionsOverride<unknown> {
    if (typeof override !== "object" || override === null) {
        return false;
    }
    const candidate = override as { readonly?: unknown; capture?: unknown };
    return "readonly" in candidate || "capture" in candidate;
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
            fields[key] = { kind: "accessor", get: override.get, set: override.set, capture: override.capture };
        } else if (isCaptureOverride(override)) {
            fields[key] = { kind: "field", holder, key, capture: override };
        } else if (isFieldOptionsOverride(override)) {
            fields[key] = { kind: "field", holder, key, readonly: override.readonly, capture: override.capture };
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

/** Thrown for invalid operations against the tunable-constants registry, e.g. an unregistered path, a duplicate registration, or a write to a read-only field. */
export class ConstantRegistryError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "ConstantRegistryError";
    }
}

/**
 * A single registered constant: either a direct reference to a field on a
 * plain object/class ("field", writable unless marked `readonly`), or an
 * explicit getter/setter pair ("accessor") for a value that needs a side
 * effect on write, or that's exposed read-only by omitting `set`. Either kind
 * may declare `capture`, an arbitrary validator run just before the write -
 * returning a string rejects the value with that reason; returning nothing
 * allows it. Range/shape checks (e.g. {@link integerRange}) are just captures.
 */
export type ConstantField<T> =
    | {
        kind: "field";
        holder: Record<string, T>;
        key: string;
        readonly?: boolean;
        capture?(value: T): string | undefined;
      }
    | {
        kind: "accessor";
        get(): T;
        set?(value: T): void;
        capture?(value: T): string | undefined;
      };

/**
 * Builds a {@link ConstantField.capture} validator rejecting anything outside
 * `[min, max]`.
 *
 * @param min - The smallest allowed value, inclusive.
 * @param max - The largest allowed value, inclusive.
 * @returns A capture function for use as a field's `capture`.
 */
export function numberRange(min: number, max: number): (value: number) => string | undefined {
    return (value) => {
        if (value < min) {
            return `${value} is below the minimum of ${min}.`;
        }
        if (value > max) {
            return `${value} is above the maximum of ${max}.`;
        }
        return undefined;
    };
}

/**
 * Builds a {@link ConstantField.capture} validator rejecting anything that
 * isn't an integer in `[min, max]`.
 *
 * @param min - The smallest allowed value, inclusive.
 * @param max - The largest allowed value, inclusive.
 * @returns A capture function for use as a field's `capture`.
 */
export function integerRange(min: number, max: number): (value: number) => string | undefined {
    const checkRange = numberRange(min, max);
    return (value) => (Number.isInteger(value) ? checkRange(value) : `${value} is not an integer.`);
}

/**
 * Builds a {@link ConstantField.capture} validator rejecting any negative
 * integer.
 *
 * @returns A capture function for use as a field's `capture`.
 */
export function nonNegativeInteger(): (value: number) => string | undefined {
    return integerRange(0, Infinity);
}

/**
 * Builds a {@link ConstantField.capture} validator rejecting any negative number.
 *
 * @returns A capture function for use as a field's `capture`.
 */
export function nonNegativeNumber(): (value: number) => string | undefined {
    return numberRange(0, Infinity);
}

/**
 * A flat, path-addressed registry of tunable constants. Every holder
 * registers its fields directly under its own dotted path.
 */
export class ConstantRegistry {
    private readonly fieldsByPath = new Map<string, ConstantField<unknown>>();
    private readonly snapshotsByPath = new Map<string, unknown>();

    /**
     * Reads a field's current value, dispatching on its {@link ConstantField} kind.
     *
     * @param field - The field to read.
     * @returns The field's current value.
     */
    private readField(field: ConstantField<unknown>): unknown {
        return field.kind === "field" ? field.holder[field.key] : field.get();
    }

    /**
     * Writes a value to a field, dispatching on its {@link ConstantField} kind.
     *
     * @param field - The field to write.
     * @param value - The value to write.
     */
    private writeField(field: ConstantField<unknown>, value: unknown): void {
        if (field.kind === "field") {
            if (field.readonly) {
                throw new ConstantRegistryError("Cannot set a read-only constant.");
            }
            field.holder[field.key] = value;
            return;
        }
        if (!field.set) {
            throw new ConstantRegistryError("Cannot set a read-only constant.");
        }
        field.set(value);
    }

    /**
     * Looks up the field registered at `path`, or throws if none is registered.
     *
     * @param path - A dotted path.
     * @returns The registered field at `path`.
     */
    private requireField(path: string): ConstantField<unknown> {
        const field = this.fieldsByPath.get(path);
        if (!field) {
            throw new ConstantRegistryError(`No constant is registered at path '${path}'.`);
        }
        return field;
    }

    /**
     * Registers a holder's fields under `path`. Each field becomes
     * addressable as `${path}.${key}`. A snapshot of each field's current
     * value is taken immediately, before anything could have called
     * {@link set}, for later use by {@link reset}.
     *
     * @param path - The dotted path this holder's fields live under.
     * @param fields - The holder's fields, keyed by their final path segment.
     */
    public registerHolder(path: string, fields: Record<string, ConstantField<unknown>>): void {
        for (const [key, field] of Object.entries(fields)) {
            const fullPath = `${path}.${key}`;
            if (this.fieldsByPath.has(fullPath)) {
                throw new ConstantRegistryError(`A constant is already registered at path '${fullPath}'.`);
            }
            this.fieldsByPath.set(fullPath, field);
            this.snapshotsByPath.set(fullPath, this.readField(field));
        }
    }

    /**
     * Reads the current value at a registered path.
     *
     * @param path - A registered dotted path.
     * @returns The current value at `path`.
     */
    public get<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P): ValueAt<S, P> {
        return this.readField(this.requireField(path)) as ValueAt<S, P>;
    }

    /**
     * Writes a value to a registered path, running whatever side effect is
     * registered for that field (see {@link ConstantField}'s `"accessor"`
     * variant). Throws if the field at `path` is read-only, if `value`'s
     * runtime type doesn't match the field's current value, or if the
     * field's `capture` validator rejects `value`.
     *
     * @param path - A registered dotted path.
     * @param value - The value to write.
     */
    public set<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P, value: ValueAt<S, P>): void {
        const field = this.requireField(path);
        const current = this.readField(field);

        if (typeof value !== typeof current) {
            throw new ConstantRegistryError(
                `Cannot set '${path}': expected ${typeof current}, got ${typeof value}.`,
            );
        }
        const rejection = field.capture?.(value);
        if (rejection) {
            throw new ConstantRegistryError(`Cannot set '${path}': ${rejection}`);
        }

        this.writeField(field, value);
    }

    /**
     * Restores the value at `path` to what it was when its holder was
     * registered, re-running any registered setter side effect rather than
     * just overwriting the field.
     *
     * @param path - A registered dotted path.
     */
    public reset<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P): void {
        if (!this.snapshotsByPath.has(path)) {
            throw new ConstantRegistryError(`No constant is registered at path '${path}'.`);
        }
        this.writeField(this.requireField(path), this.snapshotsByPath.get(path));
    }

    /**
     * Lists the next path segment for every registered path nested under
     * `prefix`, without descending further than one level - e.g. for
     * `world.entities.fox.dash.durationMs` and `world.entities.fox.movement.speed`,
     * `listPaths("world.entities.fox")` returns `["world.entities.fox.dash",
     * "world.entities.fox.movement"]`, not the full leaf paths. Throws if
     * `prefix` matches nothing registered.
     *
     * @param prefix - A dotted path prefix. Omit to list top-level segments.
     * @returns Every distinct path one level under `prefix`.
     */
    public listPaths(prefix?: string): string[] {
        const depth = prefix ? prefix.split(".").length + 1 : 1;
        const segments = new Set<string>();
        for (const path of this.fieldsByPath.keys()) {
            if (prefix && !path.startsWith(`${prefix}.`)) {
                continue;
            }
            segments.add(path.split(".").slice(0, depth).join("."));
        }
        if (segments.size === 0) {
            throw new ConstantRegistryError(
                prefix ? `No constant is registered under path '${prefix}'.` : "No constants are registered.",
            );
        }
        return [...segments];
    }

    /**
     * Lists every registered leaf path equal to, or nested at any depth
     * under, `prefix`.
     *
     * @param prefix - A dotted path prefix. Omit to list every registered path.
     * @returns Every registered path equal to, or nested under, `prefix`.
     */
    public getAllPaths(prefix?: string): string[] {
        if (!prefix) {
            return [...this.fieldsByPath.keys()];
        }
        return [...this.fieldsByPath.keys()].filter((path) => path === prefix || path.startsWith(`${prefix}.`));
    }

    /**
     * Registers a plain object's own properties as tunable constants under
     * `path`. Each key becomes addressable as `${path}.${key}`, reading and
     * writing the exact same property `obj` already exposes - unless
     * `overrides` supplies an explicit getter/setter for that key, in which
     * case the override is used instead of a direct field reference. A key
     * whose value is itself a plain object recurses, so its own properties
     * are addressable one level down.
     *
     * @param path - The dotted path this object's fields live under.
     * @param obj - The plain object whose own properties become tunable.
     * @param overrides - Per-field getter/setter overrides, keyed by property name.
     */
    public registerConstants<T extends Record<string, unknown>>(
        path: string,
        obj: T,
        overrides?: AccessorOverrides<T>,
    ): void {
        this.registerHolder(path, buildFields(obj, overrides as Record<string, unknown> | undefined));
    }

    /**
     * Removes every registered holder. For use in tests only, to isolate
     * registrations between test cases - production code never calls this.
     */
    public clear(): void {
        this.fieldsByPath.clear();
        this.snapshotsByPath.clear();
    }
}

/** The shared tunable-constants registry used throughout the running game. */
export const constantRegistry = new ConstantRegistry();
