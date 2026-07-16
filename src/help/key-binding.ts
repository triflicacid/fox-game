/**
 * A single key (or key group) and what it does, for display in the game's
 * help popup (see {@link HelpController}).
 */
export interface KeyBinding {
    /** Human-readable label for the key(s), e.g. `"Z"` or `"Arrow Keys"`. */
    key: string;
    /** What pressing the key does. */
    description: string;
}
