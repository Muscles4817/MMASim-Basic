# 16 — Contracts, Free Agency & Managers

> Status: design, pre-critique. Nothing here is built.
>
> Supersedes the contract sketch in [13 — Promoter Mode](./13-promoter-mode.md) and the
> manager layer proposed in [15 — Design Review Synthesis](./15-design-review-synthesis.md).

## Why these three are one document

They are the same system seen from three sides. A contract is the *terms*; free agency is
what happens when the terms run out; a manager is the person who negotiated them and who
gets paid whether they were good terms or not.

Modelling any one alone produces something inert. Contracts without free agency are a number
on a screen. Free agency without managers is the player doing arithmetic against an AI that
has no opinion. Managers without contracts have nothing to manage.

## The thesis

**A fighter's career is decided as much by what they signed as by what they can do.**

That is the claim, and it is the most under-modelled true thing in the sport. Fighters have
been made and ruined by contract terms — locked to a promotion at a purse that stopped being
fair three wins ago, unable to leave because of a clause they did not read, taking a fight on
eleven days because their manager needed the cheque. None of that is currently expressible.

The failure state to avoid is equally clear: **this must not become paperwork.** Every term
below exists because it produces a decision or a consequence the player can feel. Anything
that is merely accurate gets cut.

---

## Part 1 — Contracts

### The terms

| Term | What it is | The decision it creates |
| ---- | ---------- | ----------------------- |
| **Base purse** | Paid to show, win or lose | Security now against upside later |
| **Win bonus** | Paid only on a win | Cheap for the promotion if you lose. A fighter who backs themselves takes more of their money here |
| **Fight count** | How many bouts the deal covers | A long deal is safety if you plateau and a cage if you become a star |
| **Term length** | Calendar expiry, whichever comes first | Protects a fighter who gets injured; the promotion may prefer count-only |
| **Champion's clause** | The promotion may extend the deal indefinitely while you hold the belt | Entirely standard, entirely legal, and the sharpest object in the mode |
| **Matching rights** | The promotion may match any rival offer | Makes "testing the market" mostly theatre |
| **Exclusivity** | Whether you may fight elsewhere at all | Regional deals are often non-exclusive; global ones never are |
| **Signing bonus** | Paid up front | The lever a smaller promotion has when it cannot beat the purse |

### Contract quality is *relative*, and that is the point

A purse is not good or bad in isolation. It is good or bad against **what you are worth
now**, and what you are worth changes while the contract does not.

```
   fairness = purse ÷ marketValue(fighter, promotion)
```

`marketValue` is the same arithmetic `purseFor()` already uses — star power dominating,
reputation contributing, promotion prestige scaling. A deal signed at 22 and honoured at 27
after three finishes is *the* recurring grievance of the sport, and it falls straight out of
this without being scripted.

**The fighter knows.** Fairness below ~0.7 generates resentment, which is a stored per-fighter
number that feeds relationship, willingness to re-sign, and — for a high-ego fighter —
public complaint that costs the promotion buzz.

### Renegotiation

A contract can be reopened before it expires. The promotion is never obliged to.

**Triggers that give a fighter standing**: winning a title, three consecutive finishes, a
main-event draw far above their pay grade, a Fight of the Night in a card that sold.

**What a promotion weighs**: cost against the relationship, and the risk of a disgruntled
star leaving at expiry anyway. A promotion with high `narrativeControl` can stall — publicly
insisting the fighter is being looked after — at a cost to relationship that only surfaces
later.

**The refusal is the interesting branch.** A fighter refused a renegotiation may sit out.
That costs them ring time, costs the promotion a card, and is one of the few levers a fighter
has against a promotion that holds all the others.

### Cutting

Cheap, immediate, and permanent. Two or three losses and the promotion is entitled to release
you — and the fighter you release sometimes becomes a champion elsewhere, which should be
visible in the news feed specifically so it stings.

For the player in fighter mode, being cut is the mode's real failure state: not a game over,
but a fall down the tiers, and a climb back with a worse record.

---

## Part 2 — Free agency

### How a contract ends

1. **Fights exhausted.** The common case.
2. **Term expiry.** Protects the fighter who spent a year injured.
3. **Release.** Either side, by agreement or by the promotion cutting.

…except when the **champion's clause** applies, in which case it does not end at all while
you hold the belt. This is the single most consequential term in the document and it is
deliberately available from the start: a promotion that offers a big purse *and* a champion's
clause is making an honest trade, and the player should be allowed to take it and regret it.

### The market

When a fighter reaches free agency, every promotion that can afford them and has room in the
division makes a decision. An offer is driven by:

- **What they are worth** (`marketValue`)
- **Divisional need** — a promotion thin at 155 pays over the odds
- **Prestige gap** — a regional promotion signing a global name pays a premium it cannot
  really afford, which is how promotions overextend
- **Style** — a promotion whose audience wants finishers pays more for a finisher
- **History** — cutting somebody and then bidding for them costs extra

### The player's decision, which must never have one right answer

```
        MONEY                 OPPORTUNITY              LEVEL
   the biggest purse      the fastest route         the hardest
                          to a belt                 competition

   ↓ at a promotion       ↓ against nobody          ↓ for less money,
     nobody watches         anybody rates             and you may lose
```

A regional promotion offering double and a title shot inside a year is a genuinely
attractive trap: you get rich and ranked, and your reputation among people who matter goes
nowhere. Taking the smaller cheque at the global promotion and starting on the prelims is
often correct and never obviously so.

### Matching rights

If the current promotion holds them, "testing the market" produces an offer they can simply
match — so the fighter's leverage is not the offer itself but the *threat* of losing them.
Rival promotions know this and will sometimes overbid deliberately to make matching painful,
which is a hostile act the player can also commit in promoter mode.

---

## Part 3 — Managers

### What a manager is for

A fighter does not negotiate their own contract, does not choose their own opponents unaided,
and does not hear about the short-notice opportunity first. A manager is the interface
between a fighter and the business, and they take a percentage for it.

### Attributes

| Attribute | What it does |
| --------- | ------------ |
| **Negotiation** | Purse achieved against `marketValue`. A great manager gets 1.3×; a poor one gets 0.8× |
| **Connections** | Which promotions will take their call at all. Gates who you can even be offered to |
| **Standing** | Whether a promotion fears annoying them. Drives short-notice offers and favourable matchmaking |
| **Integrity** | Whether their advice serves the fighter or the commission. Hidden |
| **Stable size** | How many fighters they carry. More reach, less attention |

### The percentage

Managers take 10–20% of purse. That is the honest number and it produces the honest
incentive: **a manager is paid on money, not on career.** A fight that pays well and comes
too soon is good for them and bad for you, and a low-integrity manager will take it.

### The three conflicts

**1. Manager versus coach.** The manager wants the payday; the coach wants the right fight at
the right time. When they disagree the *fighter* chooses, weighing loyalty, ambition and
what is on the table. This is the row that makes both roles feel like people.

**2. Stable conflicts.** A manager with several fighters in one division will not put two of
their own together — so a fight the player wants can simply be refused, by their own manager,
for reasons that have nothing to do with them. This is real, common, and infuriating in
exactly the right way.

**3. The manager who is right.** A good manager telling a fighter not to take a fight, and
being correct, is what stops the role reading as a parasite. The mode is much better if the
player sometimes overrules them and is punished for it.

### Choosing and firing

A debutant gets whoever will take them, which is nobody good. Reputation buys access to
better managers, and switching costs a fee, a cooling-off period, and — with a well-connected
manager — a quiet reduction in what the promotions offer for a while.

**Firing a good manager because they told you something true is a mistake the game should
allow.**

### What managers are in each mode

| Mode | The manager is |
| ---- | -------------- |
| Fighter | Your negotiator and your first source of bad advice |
| Promoter | The counterparty in every negotiation. One with four of your fighters has leverage and uses it |
| Coach | A rival influence on your own fighter, who is sometimes right |

---

## Data shape (sketch)

```ts
interface Contract {
  id; fighterId; promotionId;
  basePurse; winBonus; signingBonus;       // thousands
  fightsTotal; fightsRemaining;
  signedDay; expiresDay;
  championsClause: boolean;
  matchingRights: boolean;
  exclusive: boolean;
  /** Snapshot of marketValue at signing, so drift is measurable. */
  valueAtSigning: number;
}

interface Manager {
  id; name;
  negotiation; connections; standing; integrity;  // 1–100
  percentage;                                      // 0.10–0.20
  clientIds: readonly FighterId[];
  personality: Personality;
}
```

`Fighter` gains `contractId?` and `managerId?`. Both nullable: an unsigned, unmanaged fighter
is a real state and the state every created fighter starts in.

---

## What must never happen

- **Paperwork.** If a term does not change a decision or produce a consequence, it is deleted.
- **A dominant contract strategy.** If "always hold out" or "always take the money" wins, the
  triangle has collapsed.
- **A manager who is only a tax.** If the optimal play is to fire them and self-manage, the
  role has failed.
- **Free agency as a menu.** Choosing between offers must be choosing between *futures*, not
  comparing two numbers.
- **The champion's clause as a gotcha.** It must be visible, explained, and priced at signing.
  The player takes it knowingly or not at all.

## Open questions

- Should the player in fighter mode be able to *self-manage*? Realistic, and it risks making
  the manager optional.
- How much of a contract's terms should a low-reputation fighter be able to see or influence?
  Being offered a take-it-or-leave-it deal is authentic and unfun.
- Do managers move between promotions' good graces dynamically, or is `connections` static?
- Should a manager be able to *lie* to the fighter about what is on the table?
