import {NoiseField} from "./noise-field";
import {Registry} from "../../store/registry";

/**
 * Named lookup of every {@link NoiseField} a {@link ChunkGenerator} was built with.
 */
export class NoiseFieldRegistry extends Registry<string, NoiseField> {
    protected override keyOf(field: NoiseField): string {
        return field.name;
    }
}
