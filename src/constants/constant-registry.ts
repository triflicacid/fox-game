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
 * effect on write, or that's exposed read-only by omitting `set`.
 */
export type ConstantField<T> =
    | { kind: "field"; holder: Record<string, T>; key: string; readonly?: boolean }
    | { kind: "accessor"; get(): T; set?(value: T): void };

const fieldsByPath = new Map<string, ConstantField<unknown>>();
const snapshotsByPath = new Map<string, unknown>();

/**
 * Reads a field's current value, dispatching on its {@link ConstantField} kind.
 *
 * @param field - The field to read.
 * @returns The field's current value.
 */
function readField(field: ConstantField<unknown>): unknown {
    return field.kind === "field" ? field.holder[field.key] : field.get();
}

/**
 * Writes a value to a field, dispatching on its {@link ConstantField} kind.
 *
 * @param field - The field to write.
 * @param value - The value to write.
 */
function writeField(field: ConstantField<unknown>, value: unknown): void {
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
function requireField(path: string): ConstantField<unknown> {
    const field = fieldsByPath.get(path);
    if (!field) {
        throw new ConstantRegistryError(`No constant is registered at path '${path}'.`);
    }
    return field;
}

/**
 * Registers a holder's fields under `path`. Each field becomes addressable
 * as `${path}.${key}`. A snapshot of each field's current value is taken
 * immediately, before anything could have called {@link set}, for later use
 * by {@link reset}.
 *
 * @param path - The dotted path this holder's fields live under.
 * @param fields - The holder's fields, keyed by their final path segment.
 */
export function registerHolder(path: string, fields: Record<string, ConstantField<unknown>>): void {
    for (const [key, field] of Object.entries(fields)) {
        const fullPath = `${path}.${key}`;
        if (fieldsByPath.has(fullPath)) {
            throw new ConstantRegistryError(`A constant is already registered at path '${fullPath}'.`);
        }
        fieldsByPath.set(fullPath, field);
        snapshotsByPath.set(fullPath, readField(field));
    }
}

/**
 * Reads the current value at a registered path.
 *
 * @param path - A registered dotted path.
 * @returns The current value at `path`.
 */
export function get<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P): ValueAt<S, P> {
    return readField(requireField(path)) as ValueAt<S, P>;
}

/**
 * Writes a value to a registered path, running whatever side effect is
 * registered for that field (see {@link ConstantField}'s `"accessor"`
 * variant). Throws if the field at `path` is read-only.
 *
 * @param path - A registered dotted path.
 * @param value - The value to write.
 */
export function set<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P, value: ValueAt<S, P>): void {
    writeField(requireField(path), value);
}

/**
 * Restores the value at `path` to what it was when its holder was
 * registered, re-running any registered setter side effect rather than just
 * overwriting the field.
 *
 * @param path - A registered dotted path.
 */
export function reset<S = ConstantsSchema, P extends DotPath<S> = DotPath<S>>(path: P): void {
    if (!snapshotsByPath.has(path)) {
        throw new ConstantRegistryError(`No constant is registered at path '${path}'.`);
    }
    writeField(requireField(path), snapshotsByPath.get(path));
}

/**
 * Lists every registered path under `prefix`.
 *
 * @param prefix - A dotted path prefix. Omit to list every registered path.
 * @returns Every registered path equal to, or nested under, `prefix`.
 */
export function listPaths(prefix?: string): string[] {
    if (!prefix) {
        return [...fieldsByPath.keys()];
    }
    return [...fieldsByPath.keys()].filter((path) => path === prefix || path.startsWith(`${prefix}.`));
}

/**
 * Removes every registered holder. For use in tests only, to isolate
 * registrations between test cases - production code never calls this.
 */
export function clearRegistry(): void {
    fieldsByPath.clear();
    snapshotsByPath.clear();
}
