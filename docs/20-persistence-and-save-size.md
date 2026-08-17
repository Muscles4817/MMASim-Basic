# 20 — Persistence and save size

**Status:** proposal, not approved. Decision points in §5 are open. Written after a player hit the
quota in ordinary play; every number in §0 was measured rather than estimated, and the two places
where I am estimating say so.

> **The short version.** A fresh 2026 save is **2.80 MB before a single fight**, against a
> `localStorage` budget of about 5 MB shared across every save on the origin. One in-game year
> reaches 4.90 MB. Two 2026 saves cannot coexist. And **2.73 of that 2.80 MB is the seed roster** —
> content that is byte-identical in every save of that era and reproducible from
> `buildSeedWorld('2026')`, which makes this the largest violation of doc 00's "nothing derived is
> ever stored" in the codebase.

---

## 0. What was measured

Method: `createNewGame` with an inspectable adapter, then `db.save()` and the serialised length of
every key the repositories actually write — the same `JSON.stringify(envelope)` per collection that
`repository.ts:flush` produces. Sizes are UTF-16 bytes, which is what a `localStorage` quota counts.

| | 2020 | 2026 (`DEFAULT_ERA`) |
|---|---|---|
| Fresh, before any fight | 0.53 MB | **2.80 MB** |
| After 1 in-game year | 1.13 MB | **4.90 MB** |
| After 2 years | 1.56 MB | 6.19 MB |
| After 3 years | 1.91 MB | 7.63 MB |
| After 10 years | 4.17 MB | 16.71 MB |

2020 reaches the ceiling somewhere around year twelve. **2026 reaches it inside the first
in-game year**, and it is the era the menu offers first and the one a new player gets.

Where the bytes are, on 2026:

| Collection | Fresh | 10 years | Pruned? |
|---|---|---|---|
| `fighters` | 2,794 KB | 10,210 KB | no |
| `agreements` | 0 | 4,080 KB | no |
| `events` | 0 | 2,375 KB | no |
| `championships` | 30 KB | 219 KB | no |
| `news` | 0 | 191 KB | **yes** — `FEED_CAPS` in `news.ts` |

One fighter is 3,884 bytes. The largest fields:

```
notes            626      priorRecord      278
attributes       472      summary          278
potential        472      naturals         274
                          personality      240
```

Other figures behind §1: a record entry is ~476 bytes and a ten-year save holds 10,046 of them; a
night is ~4,230 bytes and a ten-year save holds 701; three years produces 1,798 agreements of which
313 are already `terminated`; `summary` across the roster is 256 KB.

**Saves share one quota.** `namespaceFor` gives each save its own key prefix, but all prefixes live
in the same origin's `localStorage`. Two fresh 2026 saves are 5.6 MB and neither will finish
writing.

---

## 1. What is actually wrong

Four separate defects, and only the first is about size.

**1.1 — The save stores what it can derive.** The seed roster is a pure function of
`buildSeedWorld(era)`. `summary` is documented as reconstructable and `summariseRecord` is the
function that does it. `potential` is set once at generation and never moves. Together that is the
overwhelming majority of a fresh save, and doc 00's non-negotiables say *"nothing derived is ever
stored"* — a rule this obeys everywhere except at the one place where it costs 2.73 MB.

**1.2 — The save never forgets.** There is no retention policy anywhere except the news feed, which
has one and is consequently the only collection that stops growing. Terminated agreements are kept
forever; so is every card ever run, including its full bout list, for promotions that may no longer
exist. Neither is read again by anything.

**1.3 — Authored content is duplicated into every save.** `notes` is 626 bytes of hand-written prose
per fighter — 537 KB across the 2026 roster — and it is identical in every save anyone ever makes.
So are names, nationalities, heights, reaches and birth days.

**1.4 — Every save rewrites a whole collection.** `repository.ts:flush` serialises all rows of a
dirty collection into one string and writes it. So finishing a training camp — one fighter changed —
re-serialises and rewrites all 858 fighters, 2.73 MB, synchronously, on the main thread. This is
independent of the quota and it will not be fixed by making the save smaller; it is a *shape*
problem. There are 17 `db.save()` sites in the app.

---

## 2. Why this is worse on a phone than on a desktop

`localStorage` is ~5 MB everywhere, so the ceiling is not itself mobile-specific. These are:

- **Eviction.** *As I understand current behaviour and it should be verified rather than trusted:*
  iOS Safari clears script-writeable storage for a site after about seven days without interaction
  unless it has been installed to the home screen, and `navigator.storage.persist()` — the API that
  exists to prevent exactly this — has historically been a no-op there. A daily commuter is fine; a
  fortnight's holiday is not. **This risk is independent of save size and shrinking the save does
  nothing for it.** Neither `persist()` nor `estimate()` is called anywhere in the codebase today,
  and there is no install prompt.
- **Synchronous writes on the main thread.** §1.4, felt as a hitch on every camp, fight and contract
  on a mid-range Android.
- **Boot cost.** Every collection is read and parsed up front. Parsing 16 MB of JSON on a cheap
  phone is a few hundred milliseconds of frozen UI — *estimated, not profiled.*
- **No rescue path.** There is no export or import of a save anywhere in the app. A save that is
  evicted, corrupted or too big to write is simply gone, and a twelve-year career is the single
  thing this game asks a player to invest in.
- **Failures are unguarded.** `GameProvider` catches `StorageWriteError` into `setSaveError`, but the
  17 `db.save()` calls inside `career.ts`, `clock.ts`, `contracts.ts` and `progression.ts` are not
  wrapped, so a quota failure inside a game action reaches the `ErrorBoundary`. The adapter's own
  comment argues at length that a save must fail loudly rather than silently — it does, and then
  nothing sensible catches it.

---

## 3. Why the cloud is not the answer to this

It is the answer to a *different* problem, and the distinction is worth keeping sharp.

**Cloud must never be the read path.** The assumed play space is a commute: tunnels, dead zones,
airplane mode. A game that stalls on a network read is unplayable exactly when it is being played,
and there is no reason for it to — the engine is deterministic, offline-complete, and has no server
authority to defer to. Local-first is not a compromise here, it is the correct architecture.

**Cloud is the only answer to eviction.** Nothing local can protect a save from a browser that
decides to clear it. So there is a real role for an opportunistic, asynchronous, never-blocking
backup: with it, spotty signal degrades to "your backup is a day stale" rather than "you cannot
play".

**But it is downstream of the size work, not a substitute for it.** 16.7 MB of JSON gzips to
perhaps 2–3 MB (*estimated*), and uploading that on cellular on every save is hostile to the player
in a way that is hard to walk back. Shrinking the save is what makes a backup unremarkable.

---

## 4. The sequence

| Phase | Lands | Effort | Risk |
|---|---|---|---|
| **0** | **A test that measures save size**, and fails today | half a day | none — pure measurement |
| **1** | Quota errors surface properly; **export/import a save to a file** | 1–2 days | none — additive |
| **2** | **IndexedDB adapter**, per-row writes | 2–4 days | the storage layer, with a migration |
| **3** | Retention: terminated agreements, ancient nights | 1 day | small; changes what history exists |
| **4** | Stop storing `summary` and `potential` | 1 day | schema change, small surface |
| **5** | **Seed-diff saves** — store era + seed + what changed | 1–2 weeks | schema change with a versioning problem |
| **6** | Cloud backup | a real project | auth, a server, a bill |

**Phase 0 first, for the same reason doc 19 phase 0 came first.** Nothing in the suite measures save
size, which is precisely why a 2.80 MB fresh save shipped as the default era. The test should assert
a fresh-save budget and a ten-year budget, and it should fail on the day it is written — that is the
point. It is also the only way any later phase can claim to have worked.

**Phase 1 before phase 2** because a player whose save is already too big to write needs a way out
today, and because export/import is the migration tool phase 2 wants anyway: the safest
`localStorage` → IndexedDB migration is "read the old namespace, write the new one, keep the old
until it verifies".

**Phase 2 removes the ceiling and nothing else.** Quota goes from ~5 MB to a share of free disk,
which makes even a twenty-year 2026 save a non-event. Everything after it is quality rather than
survival, and it should be shipped alone.

**Phase 5 is the one with a real design problem in it,** and it is not the diffing — it is *seed
versioning*. If a save stores "2026 plus these changes" and the 2026 seed data is later edited, every
old save silently reconstructs a subtly different world: a fighter with different ratings, or a
promotion that no longer exists. Any answer has to include a version stamp and a fallback, and the
fallback has to be something better than losing the save.

**Phase 6 last**, and only once phase 5 has made the payload small enough that nobody has to think
about it.

---

## 5. Decision points — open, for the owner

**D1 — Does `StorageAdapter` stay synchronous?** IndexedDB is asynchronous; the interface is
`read: (key) => string | undefined` and every caller assumes it. → *Recommend keeping reads
synchronous* — the adapter already mirrors everything into an in-memory `Map`, so reads can go on
being instant — and making writes an async write-behind under the existing signature. The honest
cost: a write-behind can lose the last write when a tab is killed, which is the exact silent-failure
class the adapter's own comment says it will not tolerate. It therefore needs a flush on
`visibilitychange`/`pagehide`, and that has to be part of the phase rather than a follow-up. The
alternative — an async interface and updating all callers — is more truthful about what the backend
is and considerably more invasive.

**D2 — How is a seed-diff save versioned?** → *Recommend hashing the serialised seed output and
storing the hash*, with a full snapshot written alongside the diff for any save whose hash no longer
matches. Costs bytes only for saves that have gone stale.

**D3 — Per-row or per-collection writes?** §1.4 is a shape problem and IndexedDB fixes it naturally
with a row per key. → *Recommend per-row*, decided as part of phase 2 rather than left for later,
because the migration is the cheap moment to change the layout.

**D4 — Cloud: backup, or sync across devices?** → *Recommend backup only.* Sync means conflict
resolution between two devices that both played offline, which is a project of its own and one this
game does not obviously need.

**D5 — Retention horizon for nights?** Keep enough that a fighter's own record is explicable and a
promotion's history is real; nobody needs a prelim card from twelve years ago. → *No recommendation
without a look at what the UI actually reads.*

**D6 — Does the player ever see a storage number?** → *Recommend not.* A save-size readout is a
confession, not a feature. Revisit only if phase 5 lands and the number is still uncomfortable.

---

## 6. What not to do

**Do not reach for compression first.** An LZ-string pass over the same payload buys perhaps 5× and
is the single most tempting move on this list, because it is one dependency and one line in the
adapter. It also hides all four defects in §1 behind a CPU cost paid on every save, keeps rewriting
2.73 MB to change one fighter, and makes the *next* person's measurement harder to interpret. It is a
reasonable thing to do to a save that is already the right shape.

**Do not make the cloud the read path.** §3.

**Do not prune a fighter's record.** Everything else in §1.2 is disposable; the record is the career,
and the career is the game. If ten thousand record lines is genuinely too many, that is an argument
for summarising *old seasons* into a retained aggregate, not for forgetting them.

**Do not ship phase 2 and phase 5 together.** One changes where saves live and the other changes what
is in them. Together, a corrupted save has two possible causes and no way to tell them apart.

**Do not add a fifth era, roster or division while this is open.** Every one of them multiplies a
number that is already over budget.

---

## 7. Definition of done

A test in the statistical or integration tier that asserts, on `DEFAULT_ERA`:

- a fresh save is **under 100 KB** (from 2.80 MB today)
- a ten-year save is **under 2 MB** (from 16.71 MB today)
- writing one changed fighter does not rewrite the whole roster

The first two are only reachable with phase 5; phase 2 and 3 together should get a ten-year save
under about 8 MB, which is worth asserting as an interim bound so the number stays visible. The third
is phase 2's claim and can be asserted the day it lands.

---

**The one-line version:** the save is 2.80 MB before anything happens, almost all of it a copy of a
roster the game can rebuild from a seed — so the fix is not a bigger bucket, it is storing the player's
career instead of the world's contents. Move to IndexedDB so nobody is losing saves this week, then
make the save small enough that a cloud backup is a detail rather than a decision.
