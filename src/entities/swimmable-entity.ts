/** If the entity supports a swim mechanic. */
export interface SwimmableEntity {
    /** Whether the entity is currently swimming (submerged in water, rather than moving over dry ground). */
    isSwimming(): boolean;

    /** Sets whether the entity is currently swimming. */
    setSwimming(swimming: boolean): void;
}
