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