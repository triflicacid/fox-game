import {PopupController} from "@lib/popup/popup-controller";
import {KeyBinding} from "../help/key-binding";

/**
 * {@link PopupController} that expose its own key bindings.
 */
export abstract class KeyBindingPopupController extends PopupController {
    /**
     * This controller's own key bindings, for the help popup to list.
     *
     * @returns This controller's key bindings.
     */
    public abstract getKeyBindings(): KeyBinding[];
}

