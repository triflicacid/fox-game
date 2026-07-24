import {Keyboard} from "@keyboard";

/**
 * single shared {@link Keyboard} instance for the browser window
 *
 * import this wherever key state or key events are needed in the main app,
 * rather than adding raw window listeners
 */
export const keyboard = new Keyboard(window);
