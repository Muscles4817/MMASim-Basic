/**
 * A fighter's medical history, as a promoter reads it. Doc 34 C6.
 *
 * Every injury was already kept on the fighter (`Fighter.injuries`, with its source "for the
 * medical history"), and nothing showed it once it healed: the page said "Currently injured" or
 * said nothing. A promoter signing somebody wants the layoffs and, above all, the things that keep
 * coming back. Derived from what is stored; nothing new is.
 */

import type { GameDay } from '../core/clock.js';
import type { Fighter } from '../domain/fighter.js';
import { INJURY_META, isActiveInjury, type Injury, type InjuryType } from './injuries.js';

export interface MedicalEntry {
  injury: Injury;
  label: string;
  /** How long it kept them out, in weeks. */
  weeksOut: number;
  /** This is at least the second of its kind. */
  recurrence: boolean;
  active: boolean;
}

export interface MedicalHistory {
  /** Newest first. */
  entries: readonly MedicalEntry[];
  /** Injury kinds on the record more than once: the flag a promoter is looking for. */
  recurring: readonly { type: InjuryType; label: string; times: number }[];
  /** Total weeks lost to injury. */
  weeksOut: number;
  /** The longest single layoff, in weeks. */
  longestLayoff: number;
}

export function medicalHistory(fighter: Pick<Fighter, 'injuries'>, day: GameDay): MedicalHistory {
  const injuries = [...(fighter.injuries ?? [])].sort((a, b) => a.day - b.day);
  const seen = new Map<InjuryType, number>();
  const entries: MedicalEntry[] = injuries.map((injury) => {
    const times = (seen.get(injury.type) ?? 0) + 1;
    seen.set(injury.type, times);
    return {
      injury,
      label: INJURY_META[injury.type].label,
      weeksOut: Math.max(0, Math.round((injury.healedDay - injury.day) / 7)),
      recurrence: times > 1,
      active: isActiveInjury(injury, day),
    };
  });
  const recurring = [...seen.entries()]
    .filter(([, times]) => times > 1)
    .map(([type, times]) => ({ type, label: INJURY_META[type].label, times }))
    .sort((a, b) => b.times - a.times);
  return {
    entries: entries.reverse(),
    recurring,
    weeksOut: entries.reduce((sum, e) => sum + e.weeksOut, 0),
    longestLayoff: entries.reduce((max, e) => Math.max(max, e.weeksOut), 0),
  };
}
