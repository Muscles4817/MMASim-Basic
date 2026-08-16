# 10 — UX & Design System

> Status: living document.

## The constraint that drives everything

**One thumb, on a phone, in a spare five minutes.** Every layout decision follows from that.
Desktop and tablet are supported and should feel deliberate, but they are the second target,
not the first.

The corollary is that *depth cannot live in density*. A screen showing fifteen numbers at
equal weight is a screen nobody reads. Depth lives in the consequences of a small number of
clear decisions.

## Layout

```
Phone (<48rem)                    Tablet / desktop (≥48rem)
┌──────────────────┐              ┌────────┬────────────────────┐
│ sticky header    │              │        │ sticky header      │
├──────────────────┤              │  left  ├────────────────────┤
│                  │              │  rail  │                    │
│   content        │              │  nav   │   content          │
│   (scrolls)      │              │        │   (max 56rem)      │
│                  │              │        │                    │
├──────────────────┤              │        │                    │
│ bottom tab bar   │              └────────┴────────────────────┘
└──────────────────┘
```

The tab bar becomes a rail at 48rem. It is the same component and the same markup — only the
CSS changes — so navigation state can never diverge between breakpoints.

### Non-negotiable rules

| Rule                          | Why                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| `--tap-target: 2.75rem` min    | Below ~44px, touch accuracy collapses. Never shrink it.         |
| Safe-area insets on all fixed edges | The tab bar must not sit under the home indicator.        |
| No horizontal page scroll      | Wide content (tables, play-by-play) scrolls inside `.scroll-x`. |
| Never block zoom               | `maximum-scale` is an accessibility failure, not a polish item. |
| One primary action per screen  | If two things are equally emphasised, neither is the answer.    |
| Scroll to top on navigation    | Carrying scroll position across screens is disorienting.        |

## Theming

Three states, not two:

| Choice   | `data-theme` | Behaviour                                       |
| -------- | ------------ | ----------------------------------------------- |
| `system` | *absent*     | Follows the OS, and keeps following it live     |
| `light`  | `light`      | Locked                                          |
| `dark`   | `dark`       | Locked                                          |

Implementation rules, in order of importance:

1. **The complete light palette is defined on bare `:root`.** No colour exists only inside a
   media query — that is how a token ends up undefined for a subset of users.
2. Dark redefines *only the tokens that change*, under `@media (prefers-color-scheme: dark)`
   guarded as `:root:not([data-theme='light'])`.
3. The same dark block is repeated under `:root[data-theme='dark']` so the explicit toggle
   wins in **both** directions.
4. `<meta name="theme-color">` is declared per scheme so the browser chrome does not flash.

Duplicating the dark block is deliberate. A shared class or a CSS-nesting trick saves a few
lines and reintroduces exactly the bug this structure exists to prevent.

## The signal vocabulary

The most common failure in a stats-heavy game is a screen where every number is the same
size, weight and colour — which makes the *player* do the sorting. Three rules, applied
everywhere, in `ui/signals.tsx`:

**1. Three tiers, visibly far apart.** Primary information is large, coloured and iconed;
secondary is plain; tertiary is muted and small. A primary stat is roughly three times the
optical weight of a tertiary one, because a subtle hierarchy is the same as no hierarchy.
At most one `KeyStat` per card, and often none.

**2. Never colour alone.** Every colour-coded signal also carries a glyph and a word. Roughly
one man in twelve cannot separate reds from greens, and a greyscale screen or a screen reader
has no colour at all. A weakness badge is *also* dashed; a poor rating bar is *also* thinner
and dotted; a fight outcome is a letter *and* a colour *and* the method text.

**3. Say what it means, not what it is.** "Wins with Power 99" beats "Power: 99". "Ranked #2"
beats "Rank: 2". The raw number stays available for the player who wants it.

### Components

| Component | Job |
| --------- | --- |
| `KeyStat` | The one thing to read first. Requires a tone, so you have to decide what it means |
| `Fact` | A labelled value with an explicit tier |
| `FighterRead` | "Wins with / Vulnerable to" — the two or three attributes that decide their fights |
| `AttributeBadge` | One attribute, band-coloured on its leading edge rather than tinted |
| `MethodBadge`, `StreakBadge`, `Trend` | Glyph plus colour plus word |
| `Alert` | Louder than a chip, quieter than a modal. For things that change a decision |

### Rating bars carry their band

An elite bar is 10px, average is 6px, poor is 5px and dotted. A row of attributes therefore
has a **silhouette** that can be read before any number is. The band short-name sits beside
the value, because "84" needs a scale in your head and "Elite" does not.

### Why badges are edge-coloured, not tinted

Nine band colours as pill backgrounds turns a row of badges into confetti and moves the text
contrast around with every hue. A fixed surface with a coloured leading edge stays scannable
and keeps contrast constant.

## Colour language

Rating band colours are the visual language of the game — a player learns to read a fighter
card by colour before they read a number. They are therefore tokens (`--band-*`), tuned per
theme for contrast rather than reused verbatim, and they map 1:1 to the bands in
[02 — Attributes & Ratings](./02-attributes-and-ratings.md).

Corner colours (`--corner-red`, `--corner-blue`) stay close to constant across themes: they
identify a fighter, and an identity that changes with the theme is not an identity.

**Colour is never the only signal.** Every band-coloured bar carries its number; every
outcome chip carries a word.

## Component inventory

| Component     | Purpose                                          | Notes                                        |
| ------------- | ------------------------------------------------ | -------------------------------------------- |
| `Card`        | Every content grouping                           | `flush` for edge-to-edge lists                |
| `Button`      | primary / secondary / ghost / danger             | One primary per screen                       |
| `Chip`        | Status, traits, tags                             | Tone carries meaning, text repeats it        |
| `RatingRow`   | One attribute: label, value, band-coloured bar   | `role="meter"` with a full accessible label  |
| `Segmented`   | 2–4 mutually exclusive options                   | `aria-pressed`, not a fake radio group       |
| `ListItem`    | Rows in a list                                   | A row that acts is a `<button>`; one that doesn't must not look like one |
| `Stat`        | One big number with a label                      | Tabular numerals                             |
| `Empty`       | Empty state with a way forward                   | Never a dead end                             |

## Screen-by-screen intent

| Screen      | The one thing it must do                                                    |
| ----------- | --------------------------------------------------------------------------- |
| **Start**   | Make choosing a fighter feel like choosing a *story*, not sorting a table    |
| **Hub**     | Show who you are and the single next decision. Never more than one primary   |
| **Camp**    | Force a committed choice under genuine uncertainty                           |
| **Fight**   | Deliver the payoff. Withhold the result until the replay reaches it          |
| **Fighter** | Make fifteen attributes readable in three seconds via four grouped blocks    |
| **Roster**  | Division-first browsing, because that is how the sport is organised          |
| **Editor**  | Total control, with warnings instead of prohibitions                         |
| **Settings**| Theme, career, and the one irreversible action — behind two steps            |

### The camp screen deserves special mention

It is where the game's central idea lives, so it breaks a normal UI convention on purpose:
the four-read limit is presented as *a budget being spent*, not a list with checkboxes.
Adding a fifth read is not prevented by a disabled control — it visibly blunts the other
four. The player should feel the trade-off, not read about it.

The scouting report shows two dimensions kept deliberately separate: how often the coach
expects something, and how sure they are. A confidently wrong coach must look identical to a
confidently right one, because that is the situation the player is actually in.

## Accessibility floor

These are requirements, not aspirations:

- Every interactive element is reachable and operable by keyboard, with a visible
  `:focus-visible` ring that is never removed.
- Text contrast meets WCAG AA in **both** themes. Band colours are tuned per theme for this
  reason.
- `prefers-reduced-motion` disables the replay's smooth scrolling and all transitions.
- The fight feed is an `aria-live="polite"` region so a screen-reader user hears the fight
  rather than having to poll it.
- Every form control has a label, visible or `visually-hidden`.
- Icons are `aria-hidden` and always accompanied by text.

## Review process

Every screen gets a UX pass, and the work is then re-reviewed by an independent agent
against mobile, desktop, accessibility, theming and game-UX criteria. Findings are triaged
CRITICAL / MAJOR / MINOR and fixed at source. The point of the second pass is to catch the
things the author has stopped being able to see.

## What the passover found

The signal vocabulary was reviewed by an independent critic whose brief was to mark it
honestly. The verdict was that it was "a genuinely good idea that is only half-installed",
and that is the right verdict — the failures were consistency failures, not concept failures.
The findings worth keeping as rules:

### A vocabulary is only as good as its least-consistent use

Six of thirteen screens imported nothing from `signals.tsx`. Two of its exports (`Trend`,
`MethodBadge`) had zero usages while screens hand-rolled worse versions of exactly those
things. A component that exists and is not used is worse than one that does not exist: it
implies a standard the code does not meet.

### The flat wall can move into the chip layer

`Chip` was the app's most-used component and had exactly one visual weight carrying eight
different meanings — championship status beside height and reach at identical emphasis. That
is the original "everything at one flat weight" complaint, relocated rather than solved. The
lesson: **a component that can express anything expresses nothing.**

### `title` is not an explanation

Fourteen call sites explained themselves only through a `title` attribute. A tooltip shows
nothing on a touch device and is unreliably announced on a role-less `<span>`, so those
explanations reached desktop-mouse users and nobody else. `ui.css` already stated this rule
and eleven call sites broke it. Teaching material goes **on the page**.

### Colour-alone creeps back in through new code

Every colour-alone failure found was in code written *after* the rule was written down: the
band-coloured overall ratings, the Grudge/Heat chips, the commentary lines. Rule 2 is easy to
agree with and easy to forget under a deadline. It needs to be checked, not just stated.

### Two corner colours were the same colour

`--corner-red` and `--corner-blue` have a computed contrast of **1.00:1** — identical relative
luminance. Every fight statistic was attributed by nothing but hue, so in greyscale the
comparison bar was one flat block. Picking two colours that "obviously look different"
without computing the ratio is how this happens.

### Disabled is not the same as unavailable

A real `disabled` attribute removes a control from the tab order. Used on a validation gate
it produces a silent dead end — the player taps and nothing happens, with no way to discover
why. Used on a Save button it destroys focus at the exact moment the user acted. Prefer
`aria-disabled` plus a handler that explains itself.

### Focus rings and `overflow: hidden`

The global `:focus-visible` uses `outline-offset`, which paints outside the element's box. A
list row flush inside a `.card--flush` (which is `overflow: hidden`) therefore had its focus
ring clipped away entirely — on the primary interactive element of six screens. Inset
`box-shadow` cannot be clipped.
