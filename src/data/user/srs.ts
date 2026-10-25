// Pure date + scheduling logic for user state (no DB, unit-testable).

import { type Grade, type SrsCard } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

// Local calendar day, 'yyyy-mm-dd' (so "today" flips at local midnight).
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Calendar arithmetic on a local day. Anchored at noon so DST shifts can
// never push the result onto a neighbouring date.
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n, 12));
}

// Consecutive active days ending today — or yesterday, so a streak isn't
// shown as broken before the user has had a chance to study today.
export function computeStreak(activeDays: Iterable<string>, today: string = localDay()): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

export function newCard(hanja: string, today: string = localDay()): SrsCard {
  return { hanja, due: today, interval: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0, lastReviewedAt: null };
}

export function isGrade(g: unknown): g is Grade {
  return typeof g === 'number' && Number.isInteger(g) && g >= 0 && g <= 5;
}

// Classic SM-2: success (>= 3) updates EF first, then grows the interval
// 1 → 6 → round(interval × EF'). Failure (< 3) resets reps and re-shows
// tomorrow, leaving EF unchanged.
export function schedule(card: SrsCard, grade: Grade, today: string = localDay(), now = Date.now()): SrsCard {
  if (!isGrade(grade)) throw new RangeError(`Invalid SRS grade: ${grade}`);
  const q = grade;
  let { reps, lapses, interval, ease } = card;
  if (q >= 3) {
    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    ease = Math.round(ease * 1000) / 1000;
    interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.max(1, Math.round(interval * ease));
    reps += 1;
  } else {
    if (reps > 0) lapses += 1; // only forgetting a learned card is a lapse
    reps = 0;
    interval = 1;
  }
  return { ...card, ease, reps, lapses, interval, due: addDays(today, interval), lastReviewedAt: now };
}
