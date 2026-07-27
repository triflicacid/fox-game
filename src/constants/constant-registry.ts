import type { ConstantsSchema, DotPath, ValueAt } from "./constants-schema";

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
 * may declare `min`/`max`, checked by {@link ConstantRegistry.set} only when
 * the incoming value is a number.
 */
export type ConstantField<T> =
    | { kind: "field"; holder: Record<string, T>; key: string; readonly?: boolean; min?: number; max?: number }
    | { kind: "accessor"; get(): T; set?(value: T): void; min?: number; max?: number };

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
     * runtime type doesn't match the field's current value, or if `value` is
     * a number outside the field's declared `min`/`max` (when set).
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
        if (typeof value === "number") {
            if (field.min !== undefined && value < field.min) {
                throw new ConstantRegistryError(`Cannot set '${path}': ${value} is below the minimum of ${field.min}.`);
            }
            if (field.max !== undefined && value > field.max) {
                throw new ConstantRegistryError(`Cannot set '${path}': ${value} is above the maximum of ${field.max}.`);
            }
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
