import { createComponent, Types } from '@iwsdk/core';

/**
 * Marks a HUD button mesh. Paired with RayInteractable, IWSDK adds the
 * Hovered and Pressed tags when a hand ray points at it or pinches it, and
 * PrismGameSystem reads `action` to know what to do.
 */
export const PrismButton = createComponent(
  'PrismButton',
  {
    action: { type: Types.String, default: '' },
  },
  'A pressable Palm Prism HUD button',
);
