/**
 * Per-player progress in localStorage: unlocked level, best stars per level
 * and a daily streak. Every access is guarded so private windows or blocked
 * storage simply start fresh instead of breaking the game.
 */

const KEY = 'palm-prism.v1';

export interface Progress {
  unlocked: number;
  stars: Record<string, number>;
  lastDay: string;
  streak: number;
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function loadProgress(): Progress {
  const fresh: Progress = { unlocked: 0, stars: {}, lastDay: '', streak: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      unlocked: Number.isFinite(parsed.unlocked) ? Number(parsed.unlocked) : 0,
      stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
      streak: Number.isFinite(parsed.streak) ? Number(parsed.streak) : 0,
    };
  } catch {
    return fresh;
  }
}

function saveProgress(p: Progress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
}

/** Streak shown to the player right now (0 if they missed a day). */
export function currentStreak(p: Progress): number {
  if (p.lastDay === today() || p.lastDay === yesterday()) return p.streak;
  return 0;
}

export function totalStars(p: Progress): number {
  let sum = 0;
  for (const key in p.stars) sum += p.stars[key];
  return sum;
}

/** Record a cleared level and update unlocks, best stars and the streak. */
export function recordClear(
  p: Progress,
  levelId: string,
  levelIndex: number,
  stars: number,
  levelCount: number,
): Progress {
  const day = today();
  let streak = p.streak;
  if (p.lastDay !== day) streak = p.lastDay === yesterday() ? streak + 1 : 1;
  const next: Progress = {
    unlocked: Math.min(Math.max(p.unlocked, levelIndex + 1), levelCount - 1),
    stars: { ...p.stars, [levelId]: Math.max(p.stars[levelId] ?? 0, stars) },
    lastDay: day,
    streak,
  };
  saveProgress(next);
  return next;
}
