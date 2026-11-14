/**
 * Accessibility options, remembered per device in localStorage. Every access
 * is guarded so blocked storage simply falls back to the defaults.
 */

const KEY = 'palm-prism.settings.v1';

export interface Settings {
  /** Freeze by holding a palm still for two seconds instead of pinching. */
  holdToFreeze: boolean;
  /** One extra freeze in every level, so it can be solved with one hand. */
  oneHand: boolean;
  /** Board height offset in metres, added when the board is placed. */
  boardOffset: number;
}

export const DEFAULT_SETTINGS: Settings = {
  holdToFreeze: false,
  oneHand: false,
  boardOffset: 0,
};

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      holdToFreeze: parsed.holdToFreeze === true,
      oneHand: parsed.oneHand === true,
      boardOffset: Number.isFinite(parsed.boardOffset)
        ? Math.max(-0.2, Math.min(0.2, Number(parsed.boardOffset)))
        : 0,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings last for this session only.
  }
}
