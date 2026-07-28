import {Accessor, Field, FieldLookupHandler, FieldRegistryError} from "../fields/field-registry";
import {Entity} from "../entities/entity";
import {World} from "./world";
import {pixelToTile, tileToPixel} from "./tile-coordinates";

/**
 * Exposes every live entity in `world` under the field registry at
 * `world.entities` (see `registerHandler`) - `main` always resolves to the
 * current main entity; every other entity is addressable by its own stable
 * {@link Entity.getRegistryId}. Resolved fresh on every call, so an entity
 * that's spawned or destroyed needs no separate register/unregister step.
 */
export class EntityLookupHandler extends FieldLookupHandler {
    public constructor(private readonly world: World) {
        super();
    }

    public listPaths(): string[] {
        return ["main", ...this.world.getEntities().map((entity) => entity.getRegistryId())];
    }

    public getAllPaths(): string[] {
        return this.listPaths().flatMap((id) => Object.keys(this.resolveEntity(id).getRegistryFields()).map((key) => `${id}.${key}`));
    }

    public get(segment: string): Field<unknown> | Record<string, unknown> {
        const fields = this.resolveEntity(segment).getRegistryFields();
        const tileSize = this.world.tileSize;
        return {
            ...fields,
            x: this.toTileAccessor(fields.x as Accessor<number>, tileSize),
            y: this.toTileAccessor(fields.y as Accessor<number>, tileSize),
        };
    }

    /**
     * Wraps a pixel-unit position {@link Accessor}.
     *
     * @param pixelField - The entity's own `x`/`y` accessor, in world pixels.
     * @param tileSize - The world's current tile size, in pixels.
     */
    private toTileAccessor(pixelField: Accessor<number>, tileSize: number): Accessor<number> {
        return {
            get: () => pixelToTile(pixelField.get(), tileSize),
            set: pixelField.set && ((value: number) => pixelField.set!(tileToPixel(value, tileSize))),
        };
    }

    private resolveEntity(id: string): Entity {
        if (id === "main") {
            return this.world.getMainEntity();
        }
        const entity = this.world.getEntities().find((candidate) => candidate.getRegistryId() === id);
        if (!entity) {
            throw new FieldRegistryError(`No entity is registered at 'world.entities.${id}'.`);
        }
        return entity;
    }
}
