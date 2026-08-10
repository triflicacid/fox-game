import {Accessor, Field, FieldLookupHandler, FieldRegistryError} from "../fields/field-registry";
import {Entity} from "./entity";
import type {ReadonlyEntityCollection} from "./entity-collection";
import {pixelToTile, tileToPixel} from "../world/coordinates/world-grid-math";

/** Exposes every live entity in `entities`. */
export class EntityLookupHandler extends FieldLookupHandler {
    /**
     * @param entities - Read-only view over the entity set.
     * @param tileSize - The world's tile size, in pixels, for converting position fields between pixels and tiles.
     */
    public constructor(private readonly entities: ReadonlyEntityCollection, private readonly tileSize: number) {
        super();
    }

    public listPaths(): string[] {
        return ["main", ...this.entities.getEntities().map((entity) => entity.getRegistryId())];
    }

    public getAllPaths(): string[] {
        return this.listPaths().flatMap((id) => Object.keys(this.resolveEntity(id).getRegistryFields()).map((key) => `${id}.${key}`));
    }

    public get(segment: string): Field<unknown> | Record<string, unknown> {
        const fields = this.resolveEntity(segment).getRegistryFields();
        const tileSize = this.tileSize;
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
        // captured for type safety
        const setPixel = pixelField.set;
        return {
            get: () => pixelToTile(pixelField.get(), tileSize),
            set: setPixel && ((value: number) => setPixel(tileToPixel(value, tileSize))),
        };
    }

    private resolveEntity(id: string): Entity {
        if (id === "main") {
            return this.entities.getMainEntity();
        }
        const entity = this.entities.getEntities().find((candidate) => candidate.getRegistryId() === id);
        if (!entity) {
            throw new FieldRegistryError(`No entity is registered at 'world.entities.${id}'.`);
        }
        return entity;
    }
}
