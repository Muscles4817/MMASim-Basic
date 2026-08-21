# 33 — Generated promotions have no identity

> Status: **open problem, deferred.** Found while writing
> [32 — Mode architecture](./32-mode-architecture-and-the-fighter-dashboard.md) § 4.4 and
> explicitly held out of that pass, which is interface work.
> Nothing in this document is built, and the fix is a world-generation change.

## The defect

`packages/data/src/world/generate.ts` builds the whole pyramid from one object:

```js
const template = scaffolding.promotions[0]!;
…
promotions.push({
  ...template,
  id, name: `${spec.label} ${i + 1}`, shortName: …,
  tier: spec.tier,
  prestige,
  budget: Math.round(shape.roster * prestige * 3),
  divisions: DIVISIONS.slice(0, spec.divisions),
  champions: {},
});
```

Every generated promotion is a spread of the seed's *first* promotion. In a Medium world that is
roughly seventy of them; in a Large world roughly a hundred and seventy.

**Varies:** `tier`, `prestige`, `budget`, `divisions`, `name`, `shortName`, `id`.

**Identical across every promotion in the world:** `baseCountry`, `notes`, `sponsorshipPolicy`,
`revenueShareCapable`, `activityGuarantee`, `minimumPurse`, `buzz`, `matchmakingAggression`,
`matchmakingStyle`, `narrativeControl`.

## Why it matters

Those ten fields are not decoration. They are the fields the simulation reads to make one
promotion behave differently from another:

| Field | What it drives |
|---|---|
| `matchmakingStyle` / `matchmakingAggression` | who gets booked against whom, and whether stars are protected — `business/matchmakingStyle.ts` |
| `narrativeControl` | whether a charismatic 6-2 fighter gets pushed ahead of a faceless 12-0 one |
| `sponsorshipPolicy` | whether a fighter keeps their own sponsors, which at the bottom of the sport is worth more than the purse — doc 16's money-versus-level trade |
| `revenueShareCapable` | whether revenue points can be offered at all, which is doc 16's *unmatchable term* |
| `minimumPurse` / `activityGuarantee` | the floor a promotion honours and the bouts it owes |
| `baseCountry` | gate, travel and talent access |

With all ten constant, the generated sport is one promotion at seventy different budgets. Free
agency has nothing to trade off; the unmatchable term is unmatchable everywhere or nowhere; a
lateral move is arithmetic on prestige.

The seeded eras do not have this problem — `seed/organisations.ts` (10 promotions) and
`seed/organisations-2026.ts` (16) are hand-authored and genuinely differentiated. The *default*
world is the one with no character in it.

## Where it shows

**In the free-agency market, as an absurd number.** Measured on a Medium generated world, a
mid-tier fighter's career dashboard reports **"111 promotions interested"**. `offersFor` prices
appetite from budget, divisional need, marketability and manager access — and with the character
fields constant across the sport, nearly every promotion at a plausible tier passes the same bar
at the same time. The dashboard row is honest and the market behind it is not: a sport where a
hundred employers all want you equally is a sport with one employer in it, repeated. The seeded
eras cannot produce this, because they only contain eight to sixteen promotions in total.

**In the new-game promotion picker.** Eleven regional promotions, all named `national N`, all
USA, cash between £2.2m and £3.9m, rosters between 48 and 68, three to five vacant belts each.
The screen is doing everything it can with what it has — the preview reads real financial state
and asks `attentionFor` what problems are already on the books, which does differentiate them —
but the table above it is eleven rows of the same promotion at slightly different sizes.

Immediately, in the new-game promotion picker: `national 11 · USA · £3.1m to spend` repeated down
the screen. Doc 32 § 11.5 ships the honest version of that screen — a table over the axes that
genuinely vary, plus a preview built from `financialSnapshot`, `attentionFor` and the roster —
and deliberately does not render `notes` or a matchmaking posture, because doing so would imply
differences that are not there.

It also shows, less visibly, everywhere a promotion is supposed to feel like a *place*: offers
that should be a choice between kinds of employer, a fighter's promotion having a reputation, a
promoter inheriting a specific problem.

## What a fix looks like

Not decided. The obvious shape is to derive the character fields from the promotion's position in
the pyramid plus its own seeded RNG, the way rosters already are — a regional show in Japan with
open sponsorship and a tournament posture is a different employer from a national US show with a
uniform deal and a protective matchmaker, and both are plausible at the same prestige.

Constraints any fix must hold:

- **Determinism.** Same seed, same world. Everything goes through `createRng` with a stable key.
- **Nothing derived is stored.** Character fields are authored world state, so they *are* stored —
  but nothing computed from them may be.
- **The pyramid still has to hold.** `tests/integration/the-pyramid-holds.test.ts` and the
  long-sim suite both assume the existing tier/prestige/budget relationships.
- **Names.** `national 11` is the same defect in the naming layer and probably wants fixing in the
  same pass.

## Open questions

- Should `baseCountry` distribution be a world-generation option, or derived from a fixed
  regional spread?
- How much should character correlate with tier? A protective matchmaker at the top of the sport
  is a different story from one at the bottom; both exist.
- Do the seeded eras stay hand-authored, or become the generator's output pinned to a seed?
