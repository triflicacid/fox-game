/**
 * Returns a random element from the given array.
 * @param array Array of items
 * @return A random item from the array, or `undefined` if the array is empty.
 */
export function randomElement<T>(array: T[]): T {
    if (array.length === 0) {
        return undefined as T;
    }
    if (array.length === 1) {
        return array[0];
    }
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Require the parameter not to be null.
 * If the parameter is null (or undefined), throw a `TypeError`.
 * @param obj Object to test.
 * @return Guaranteed non-null object.
 */
export function requireNonNull<T>(obj: T | null | undefined): T {
    if (!obj) {
        throw new TypeError('Required argument must not be null');
    }
    return obj;
}

/**
 * Copies `text` to the user's clipboard.
 * @param text Text to copy.
 */
export function copyToClipboard(text: string): void {
    void navigator.clipboard.writeText(text);
}