import {NoiseField} from "./noise-field";

/**
 * Named lookup of every {@link NoiseField} a `ChunkGenerator` was built with.
 */
export class NoiseFieldRegistry {
    private readonly fields = new Map<string, NoiseField>();

    /**
     * Registers a field under its own {@link NoiseField.name}.
     *
     * @param field - The field to register.
     */
    public register(field: NoiseField): void {
        this.fields.set(field.name, field);
    }

    /**
     * Looks up a registered field by name.
     *
     * @param name - The field's name.
     * @returns The field, or `undefined` if nothing is registered under that name.
     */
    public get(name: string): NoiseField | undefined {
        return this.fields.get(name);
    }

    /**
     * Every registered field, for the debug visualiser to list.
     *
     * @returns All registered fields.
     */
    public getAll(): readonly NoiseField[] {
        return [...this.fields.values()];
    }
}
