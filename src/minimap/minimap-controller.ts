import {KeyBinding} from "../help/key-binding";
import {Keyboard} from "@keyboard";

export class MinimapController {
    /**
     * @param keyboard - Shared keyboard state used to observe the minimap toggle hotkey.
     * @param getEnabled - Called to read whether the minimap is currently shown.
     * @param setEnabled - Invoked to change whether the minimap is shown.
     */
    public constructor(
        keyboard: Keyboard,
        private readonly getEnabled: () => boolean,
        private readonly setEnabled: (enabled: boolean) => void,
    ) {
        keyboard.onKeyDownForKey("m", this.toggleMinimap, {caseInsensitive: true});
    }

    public getKeyBindings(): KeyBinding[] {
        return [{key: "M", description: "Toggle minimap"}];
    }

    private readonly toggleMinimap = (): void => {
        this.setEnabled(!this.getEnabled());
    };
}
