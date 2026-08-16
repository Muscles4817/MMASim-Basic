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
