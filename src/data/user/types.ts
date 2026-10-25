// ── User state — per-user data, kept apart from the read-only content DB ──
// Saved characters, view history, activity days (streak), and an SM-2-style
// flashcard per saved character. Dates are LOCAL calendar days ('yyyy-mm-dd');
// SRS scheduling is day-granular.

// SM-2 recall grade: 0 = blackout … 5 = perfect. < 3 counts as a failure.
// A 4-button UI might map Again/Hard/Good/Easy → 1/3/4/5.
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export type SrsCard = {
  hanja: string;
  due: string; // local day the card is next due
  interval: number; // days
  ease: number; // SM-2 easiness factor, >= 1.3
  reps: number; // consecutive successful reviews
  lapses: number; // times a learned card was forgotten
  lastReviewedAt: number | null; // epoch ms
};

export type UserStats = {
  savedCount: number;
  dueCount: number;
  streak: number;
  activeToday: boolean;
  reviewsToday: number;
};

// One active local day (only days with activity are stored).
export type ActivityDay = { day: string; views: number; reviews: number };

export interface UserStore {
  isSaved(hanja: string): Promise<boolean>;
  // Returns the new saved state. Saving creates the SRS card (a previously
  // saved card keeps its progress); unsaving hides it from review.
  toggleSaved(hanja: string): Promise<boolean>;
  savedHanja(): Promise<string[]>; // most recently saved first

  recordView(hanja: string): Promise<void>; // also marks today active
  recentHanja(limit?: number): Promise<string[]>; // most recent first, deduped

  streak(): Promise<number>; // consecutive active days ending today or yesterday
  activity(days: number): Promise<ActivityDay[]>; // active days within the last `days` (incl. today), oldest first
  stats(): Promise<UserStats>;

  dueCount(): Promise<number>;
  dueCards(limit?: number): Promise<SrsCard[]>; // most overdue first
  review(hanja: string, grade: Grade): Promise<SrsCard>; // also marks today active

  // Change notification for reactive UI (see useUserQuery). Returns unsubscribe.
  subscribe(listener: () => void): () => void;
  version(): number; // bumps on every write
}
