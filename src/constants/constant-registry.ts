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

export type FieldOverride<T> = Accessor<T> | FieldOptionsOverride<T> | ((value: T) => string | undefined);

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

function isConstantField(value: unknown): value is ConstantField<unknown> {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const kind = (value as { kind?: unknown }).kind;
    return kind === "field" || kind === "accessor";
}

/**
 * Builds a single {@link ConstantField} for `propertyName` on `holder`,
 * dispatching on `override`'s shape: an explicit accessor, a bare capture
 * function (shorthand for `{ capture }`), `{ readonly, capture }` options
 * kept as a direct reference, or (with no override) a plain direct reference.
 *
 * @param holder - The object/class `propertyName` is a property of.
 * @param propertyName - The property this field reads and writes.
 * @param override - The override for this property, if any.
 * @returns The resulting field.
 */
function buildField(
    holder: Record<string, unknown>,
    propertyName: string,
    override: unknown,
): ConstantField<unknown> {
    if (isAccessorOverride(override)) {
        return { kind: "accessor", get: override.get, set: override.set, capture: override.capture };
    }
    if (isCaptureOverride(override)) {
        return { kind: "field", holder, key: propertyName, capture: override };
    }
    if (isFieldOptionsOverride(override)) {
        return { kind: "field", holder, key: propertyName, readonly: override.readonly, capture: override.capture };
    }
    return { kind: "field", holder, key: propertyName };
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

        const isOverridden = isAccessorOverride(override) || isCaptureOverride(override) || isFieldOptionsOverride(override);
        if (!isOverridden && isPlainObject(value)) {
            const nestedOverrides = override as Record<string, unknown> | undefined;
            for (const [nestedKey, nestedField] of Object.entries(buildFields(value, nestedOverrides))) {
                fields[`${key}.${nestedKey}`] = nestedField;
            }
        } else {
            fields[key] = buildField(holder, key, override);
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
 * A dynamically resolved subtree of the constants address space looked up fresh
 * on every `get`/`set`/`listPaths`/`getAllPaths` call instead of being registered
 * up front like {@link ConstantRegistry.registerHolder}.
 */
export abstract class ConstantLookupHandler {
    /**
     * Every immediate child segment currently reachable under this handler.
     */
    public abstract listPaths(): string[];

    /**
     * Every leaf path, at any depth, currently reachable under this handler.
     */
    public abstract getAllPaths(): string[];

    /**
     * Resolves one path segment directly under this handler: a leaf field, a
     * plain object to keep descending into via direct property access, or
     * another handler to keep descending into dynamically.
     * Throws {@link ConstantRegistryError} if `segment` isn't currently reachable.
     *
     * @param segment - The single next path segment to resolve.
     */
    public abstract get(segment: string): ConstantField<unknown> | ConstantLookupHandler | Record<string, unknown>;
}

type DynamicNode = ConstantLookupHandler | Record<string, unknown>;

/**
 * Resolves the terminal segment of a plain-object holder returned from
 * dynamic resolution.
 *
 * @param holder - The plain object the terminal segment lives on.
 * @param key - The terminal segment/property name.
 * @returns The resolved field.
 */
function resolveDynamicField(holder: Record<string, unknown>, key: string): ConstantField<unknown> {
    const candidate = holder[key];
    if (isAccessorOverride(candidate)) {
        return { kind: "accessor", get: candidate.get, set: candidate.set, capture: candidate.capture };
    }
    return { kind: "field", holder, key };
}

/**
 * Walks `segments` down from `node`, dispatching on whether each step is
 * another {@link ConstantLookupHandler} (dynamic) or a plain object (direct
 * property access, recursing into nested plain objects same as
 * {@link buildFields}). Throws {@link ConstantRegistryError} if `segments`
 * runs out on a subtree rather than a leaf, or if a plain object's next
 * segment isn't itself a plain object when more segments remain.
 *
 * @param node - The current position, starting at the handler a path resolved to.
 * @param segments - Remaining path segments to walk.
 * @param fullPath - The original full path, for error messages only.
 * @returns The resolved leaf field.
 */
function resolveDynamic(node: DynamicNode, segments: string[], fullPath: string): ConstantField<unknown> {
    const [segment, ...rest] = segments;
    if (segment === undefined) {
        throw new ConstantRegistryError(`Path '${fullPath}' resolves to a subtree, not a value.`);
    }

    if (node instanceof ConstantLookupHandler) {
        const next = node.get(segment);
        if (isConstantField(next)) {
            if (rest.length > 0) {
                throw new ConstantRegistryError(`No constant is registered at path '${fullPath}'.`);
            }
            return next;
        }
        return resolveDynamic(next, rest, fullPath);
    }

    if (rest.length === 0) {
        return resolveDynamicField(node, segment);
    }
    const nested = node[segment];
    if (!isPlainObject(nested)) {
        throw new ConstantRegistryError(`No constant is registered at path '${fullPath}'.`);
    }
    return resolveDynamic(nested, rest, fullPath);
}

/**
 * Like {@link resolveDynamic}, but stops at a subtree instead of requiring a
 * leaf - used by `listPaths`/`getAllPaths` to reach the node a deeper prefix
 * points at, so they can list what's one level (or every leaf) under it.
 *
 * @param node - The current position, starting at the handler a prefix resolved to.
 * @param segments - Remaining path segments to walk.
 * @returns The subtree `segments` points at.
 */
function navigateDynamic(node: DynamicNode, segments: string[]): DynamicNode {
    let current = node;
    for (const segment of segments) {
        const next = current instanceof ConstantLookupHandler ? current.get(segment) : current[segment];
        if (!(next instanceof ConstantLookupHandler) && !isPlainObject(next)) {
            throw new ConstantRegistryError(`Path segment '${segment}' resolves to a value, not a subtree.`);
        }
        current = next;
    }
    return current;
}

/** One level of child segments reachable from `node`, for `listPaths`. */
function listDynamicSegments(node: DynamicNode): string[] {
    return node instanceof ConstantLookupHandler ? node.listPaths() : Object.keys(node);
}

/** Every leaf path, at any depth, reachable from `node`, for `getAllPaths`. */
function listDynamicLeaves(node: DynamicNode): string[] {
    if (node instanceof ConstantLookupHandler) {
        return node.getAllPaths();
    }
    const leaves: string[] = [];
    for (const [key, value] of Object.entries(node)) {
        if (isPlainObject(value) && !isAccessorOverride(value)) {
            leaves.push(...listDynamicLeaves(value).map((leaf) => `${key}.${leaf}`));
        } else {
            leaves.push(key);
        }
    }
    return leaves;
}

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
    private readonly handlersByPath = new Map<string, ConstantLookupHandler>();

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
     * Looks up the field registered at `path`, or throws if none is
     * registered. Checked first against statically registered fields, then -
     * on a miss - resolved fresh through whichever {@link ConstantLookupHandler}
     * owns `path` (see {@link registerHandler}), if any.
     *
     * @param path - A dotted path.
     * @returns The registered (or dynamically resolved) field at `path`.
     */
    private requireField(path: string): ConstantField<unknown> {
        const field = this.fieldsByPath.get(path);
        if (field) {
            return field;
        }
        for (const [handlerPath, handler] of this.handlersByPath) {
            if (path.startsWith(`${handlerPath}.`)) {
                return resolveDynamic(handler, path.slice(handlerPath.length + 1).split("."), path);
            }
        }
        throw new ConstantRegistryError(`No constant is registered at path '${path}'.`);
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
     * Registers a {@link ConstantLookupHandler} at `path`, for a subtree
     * that's resolved fresh on every `get`/`set`/`listPaths`/`getAllPaths`
     * call instead of registered up front - e.g. one entry per currently-alive
     * game entity, which comes and goes at runtime.
     *
     * @param path - The dotted path this handler's subtree lives under.
     * @param handler - The handler resolving everything under `path`.
     */
    public registerHandler(path: string, handler: ConstantLookupHandler): void {
        if (this.handlersByPath.has(path)) {
            throw new ConstantRegistryError(`A lookup handler is already registered at path '${path}'.`);
        }
        this.handlersByPath.set(path, handler);
    }

    /**
     * Reads the current value at a registered path.
     *
     * @param path - A registered dotted path.
     * @returns The current value at `path`.
     */
    public get<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P): ValueAt<S, P>;
    /**
     * Reads the current value at a dynamically resolved path (see
     * {@link registerHandler}), which - unlike a schema-known path - can't be
     * compile-time checked.
     *
     * @param path - A dotted path, resolved at call time.
     * @returns The current value at `path`.
     */
    public get(path: string): unknown;
    public get(path: string): unknown {
        return this.readField(this.requireField(path));
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
    public set<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P, value: ValueAt<S, P>): void;
    /**
     * Writes a value to a dynamically resolved path (see
     * {@link registerHandler}), which - unlike a schema-known path - can't be
     * compile-time checked.
     *
     * @param path - A dotted path, resolved at call time.
     * @param value - The value to write.
     */
    public set(path: string, value: unknown): void;
    public set(path: string, value: unknown): void {
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

        for (const [handlerPath, handler] of this.handlersByPath) {
            if (prefix !== undefined && prefix.startsWith(`${handlerPath}.`)) {
                // Listing inside the handler's own dynamic subtree.
                const node = navigateDynamic(handler, prefix.slice(handlerPath.length + 1).split("."));
                for (const segment of listDynamicSegments(node)) {
                    segments.add(`${prefix}.${segment}`);
                }
            } else if (prefix === handlerPath) {
                // Listing directly at the handler's own root.
                for (const segment of handler.listPaths()) {
                    segments.add(`${handlerPath}.${segment}`);
                }
            } else if (!prefix || handlerPath.startsWith(`${prefix}.`)) {
                // The handler's own root is itself a (possibly deeper) segment under prefix.
                segments.add(handlerPath.split(".").slice(0, depth).join("."));
            }
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
        const staticPaths = [...this.fieldsByPath.keys()].filter(
            (path) => !prefix || path === prefix || path.startsWith(`${prefix}.`),
        );

        const dynamicPaths: string[] = [];
        for (const [handlerPath, handler] of this.handlersByPath) {
            if (prefix !== undefined && prefix.startsWith(`${handlerPath}.`)) {
                const node = navigateDynamic(handler, prefix.slice(handlerPath.length + 1).split("."));
                dynamicPaths.push(...listDynamicLeaves(node).map((leaf) => `${prefix}.${leaf}`));
            } else if (!prefix || prefix === handlerPath || handlerPath.startsWith(`${prefix}.`)) {
                dynamicPaths.push(...handler.getAllPaths().map((leaf) => `${handlerPath}.${leaf}`));
            }
        }

        return [...staticPaths, ...dynamicPaths];
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
        this.handlersByPath.clear();
    }
}

/** The shared tunable-constants registry used throughout the running game. */
export const constantRegistry = new ConstantRegistry();
