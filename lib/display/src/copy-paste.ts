/**
 * Copies `text` to the user's clipboard.
 * @param text Text to copy.
 */
export function copyToClipboard(text: string): void {
    void navigator.clipboard.writeText(text);
}

/**
 * Reads the user's clipboard as text.
 * @return The clipboard's current text content.
 */
export function readFromClipboard(): Promise<string> {
    return navigator.clipboard.readText();
}
