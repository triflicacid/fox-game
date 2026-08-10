/** Returns a seed in the range accepted by world generation. */
export function randomWorldSeed(): number {
    return Math.floor(Math.random() * 0xffffffff);
}

