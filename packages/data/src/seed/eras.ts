/**
 * Which world you are starting.
 *
 * The game shipped with exactly one starting point — 1 January 2020, a fictionalised roster —
 * and that was baked in everywhere: `SEED_DAY` was a module const, `loadOrCreateGame` took no
 * era, and the reset button said "reset to the 2020 seed". Adding a second starting point
 * means the concept has to become a value rather than an assumption.
 *
 * The two eras are deliberately different in kind, not just in date:
 *
 * - **2020** is the original hand-authored world, fictionalised. It is small, every fighter in
 *   it was written by hand, and it is the world every existing test measures against. It stays
 *   exactly as it was.
 *
 * - **2026** is a real-world roster at real depth. It exists because 2020's 139 fighters
 *   across twelve divisions and five promotions could not fill a card: measured, the world's
 *   cards averaged under three bouts against a designed size of nine, because two available
 *   fighters in the same division on the same promotion frequently did not exist.
 */

export type EraId = '2020' | '2026';

export interface EraMeta {
  id: EraId;
  /** What the player picks from a menu. */
  name: string;
  /** One line under the name. States what is actually different, not which is "harder". */
  blurb: string;
  /** ISO date the world starts on. */
  startsOn: string;
}

export const ERAS: readonly EraMeta[] = [
  {
    id: '2026',
    name: '2026 — the sport as it is',
    blurb:
      'Real promotions and real fighters, at real depth. Eight promotions and a roster deep enough to fill a card in every division.',
    startsOn: '2026-01-01',
  },
  {
    id: '2020',
    name: '2020 — the classic world',
    blurb:
      'The original hand-written world. Fictional promotions, a small roster, and thin divisions — quicker to learn, and every fighter in it was authored one at a time.',
    startsOn: '2020-01-01',
  },
];

export const DEFAULT_ERA: EraId = '2026';

export function eraMeta(id: EraId): EraMeta {
  return ERAS.find((e) => e.id === id) ?? ERAS[0]!;
}
