import {
  createSystem,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { prismAudio } from './audio.js';

/** Where the welcome panel sits in the browser view. */
const WELCOME_POSITION = new Vector3(0, 1.62, -1.25);

/**
 * Browser landing panel: shows the pitch and the Enter VR button, and moves
 * out of the way while the player is in the headset.
 */
export class PanelSystem extends createSystem({}) {
  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
    if (panel == null || xrButton == null || exitButton == null) {
      return;
    }
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      return;
    }

    const launchXR = () => {
      prismAudio.ensure();
      this.world.launchXR();
    };
    const exitXR = () => this.world.exitXR();
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
        if (is2D) panel.position.copy(WELCOME_POSITION);
        else panel.position.set(0, -100, 0);
      }),
    );
  }
}
