/**
 * Save slots.
 *
 * The game had exactly one save, in one `localStorage` namespace, created implicitly the first
 * time the app loaded. That made three things impossible at once: starting a second career
 * without destroying the first, choosing which world you were starting, and knowing what you
 * had before you loaded it.
 *
 * The storage adapter was already namespaced, so a slot is just a namespace — the data layer
 * needed a registry, not a rewrite. The registry lives in its own key outside every slot,
 * because it has to be readable *before* a slot is opened: a menu that must load a save to
 * find out what it is has already lost the argument.
 *
 * The registry is deliberately a summary rather than a pointer. It carries enough to render a
 * menu row — who you are, what era, how far in — so listing saves costs one small read rather
 * than deserialising eight hundred fighters per slot.
 */

/** Where the registry itself lives. Outside any slot's namespace, by construction. */
export const SAVE_REGISTRY_KEY = 'mmasim:saves';

export interface SaveSummary {
  id: string;
  /** What the player calls it. Defaults to the fighter's name, editable later. */
  name: string;
  era: '2020' | '2026';
  /**
   * Set when this world was **generated** rather than seeded, at the size it was generated to.
   *
   * The two are genuinely different kinds of save. A seeded one loads; a generated one has to be
   * built, which is seconds of simulated sport before anybody can play it — so the menu needs to
   * know which it is before the storage is even open, and it is what the progress screen keys on.
   * Doc 27 § 1.2: the eras become a testing artifact and generation becomes the default.
   */
  size?: 'small' | 'medium' | 'large';
  /** ISO. Set by the caller — the data layer owns no clock. */
  createdAtIso: string;
  lastPlayedIso: string;
  /** Enough to render a row without opening the save. */
  playerName?: string;
  playerRole?: 'fighter' | 'coach' | 'promoter';
  /** Game day at last save, so the menu can say how far in it is. */
  day: number;
  record?: string;
}

/** The storage namespace for a slot. One save, one namespace, no shared keys. */
export const namespaceFor = (id: string): string => `mmasim:s:${id}`;

/**
 * Read the registry.
 *
 * Tolerant of a missing or corrupt value rather than throwing: a menu that cannot render
 * because one row of JSON went bad is a worse failure than a menu missing a row, and the
 * saves themselves are in different keys and unaffected.
 */
export function listSaves(storage: Pick<Storage, 'getItem'>): SaveSummary[] {
  try {
    const raw = storage.getItem(SAVE_REGISTRY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSave);
  } catch {
    return [];
  }
}

/** Whether a value is a save row rather than whatever else ended up in the array. */
function isSave(value: unknown): value is SaveSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SaveSummary).id === 'string' &&
    typeof (value as SaveSummary).lastPlayedIso === 'string'
  );
}

/**
 * Write the registry, newest-played first so the menu needs no sort.
 *
 * Filters before sorting rather than after. Sorting first reads `lastPlayedIso` off every
 * element, which throws on a null the moment one gets in — and the whole point of this module's
 * tolerance is that a bad row costs you that row and nothing else. A throw here would take out
 * the write for every *good* save alongside it.
 */
export function writeSaves(
  storage: Pick<Storage, 'setItem'>,
  saves: readonly (SaveSummary | undefined | null)[],
): void {
  const ordered = saves
    .filter(isSave)
    .sort((a, b) => b.lastPlayedIso.localeCompare(a.lastPlayedIso));
  storage.setItem(SAVE_REGISTRY_KEY, JSON.stringify(ordered));
}

/** Add or update one entry, leaving the rest alone. */
export function upsertSave(storage: Storage, save: SaveSummary): void {
  const rest = listSaves(storage).filter((s) => s.id !== save.id);
  writeSaves(storage, [...rest, save]);
}

/**
 * Delete a save and everything in its namespace.
 *
 * Sweeps the keys rather than trusting the registry, because the registry is a summary and the
 * slot is the truth. A registry entry lost to a corrupt write would otherwise strand the whole
 * roster in storage forever, invisible and un-deletable, quietly eating the quota that made the
 * write fail in the first place.
 */
export function deleteSave(storage: Storage, id: string): void {
  const prefix = `${namespaceFor(id)}:`;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
  writeSaves(
    storage,
    listSaves(storage).filter((s) => s.id !== id),
  );
}

/**
 * A stable id for a new save.
 *
 * Derived from the clock the caller passes in plus a counter over existing saves, rather than
 * from `Math.random` — the engine forbids it and the data layer keeps the same discipline, so
 * a test can create three saves and know exactly what they are called.
 */
export function nextSaveId(existing: readonly SaveSummary[], nowIso: string): string {
  const stamp = nowIso.replace(/[^0-9]/g, '').slice(0, 14);
  let candidate = stamp;
  let n = 1;
  while (existing.some((s) => s.id === candidate)) candidate = `${stamp}_${n++}`;
  return candidate;
}
