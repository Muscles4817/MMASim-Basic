# 35 — Mode identities: three games, one set of primitives

> Status: implemented for fighter and promoter mode. Coach mode is designed here and has no
> screens yet.
>
> Revises [10 — UX & design system](./10-ux-and-design-system.md) (theming, icons, navigation)
> and [32 — Mode architecture](./32-mode-architecture-and-the-fighter-dashboard.md) § 6 (what is
> shared between modes). Mockups that led to this live in the "MMA Sim UI Directions" design
> canvas.

## The defect

The game looked like a template. Every screen in every mode was the same stack of white,
rounded, hairline-bordered cards in the system font, with pill chips, an emoji tab bar and one red
button. Severity was a coloured stripe down the left edge of a card. A player could not tell from
a screenshot whether they were a fighter or a promoter — and the two are different games.

The UX had a matching problem: screens did not lead. The fighter's deal opened on four offers
the fighter was not allowed to sign, with the deal itself third. The promotion dashboard had three
"Plan a card" buttons. The fighter page opened on a card that looked like every other card.

## The position

Fighter, coach and promoter are three different games sharing one world. They differ in
**what they are about**, not only in how they look:

| | Fighter | Coach | Promoter |
|---|---|---|---|
| Subject | One person — first person | A room of people you cannot control | A portfolio of shows, belts and money |
| Verbs | Accept, refuse, rest, reopen | Watch, instruct, hope | Plan, slot, offer, counter |
| Numbers | Exact — it is your own body | Ranges — your read has error bars (doc 14) | Classes, not ratings; money as a position (doc 29) |
| Time | This week, the next fight | The eight-week camp | Months ahead |
| Home asks | What do I do next? | Who needs me? | What are the next six months? |
| Visual voice | **The fight poster** | **The corner notebook** | **The broadcast package** |

So each mode gets its own visual identity, and the screens that embody a mode's core loop are
bespoke to it. What is *not* bespoke is the layer underneath.

### What is shared, and why

1. **The engine and its reads.** One truth about the world.
2. **Meanings, not looks.** Rating-band colours, red/blue corners, win/loss and urgency mean the
   same thing everywhere. A save is a single role, so this matters less than it would in one game
   with three skins; it costs nothing to keep.
3. **An ergonomics floor every mode meets.** The primary action in thumb reach, 44px targets, the
   type floor, 4.5:1 contrast, reduced motion. Usability, not style.
4. **Primitives whose structure is identical and whose look is not.** A button, card, chip, tab
   bar, masthead or action dock is the same accessible component in every mode. It reads its
   *voice* from tokens, and each mode's stylesheet re-declares them. This is the reusable
   component library: `packages/app/src/ui/`.
5. **A neutral voice** for screens that belong to no mode — the menu, new game before a mode is
   picked, the editor. It is the base palette in `tokens.css`, unchanged.

### What is not shared

The screens that *are* a mode — the career hub, the deal, the promotion dashboard, the card
builder, the belts — are written per mode. Doc 32 § 6 listed Calendar, Fight night and Roster as
shared screens; Calendar and Roster are in practice already forked by mode (the promoter's
calendar is a planning board, its roster is contracts), and fight night is shared only because
its playback is — its framing differs per viewer.

## How it works

### The switch

`state/mode.ts` derives a `VisualMode` (`fighter | coach | promoter | neutral`) from the save's
role, or from the new-game route when no role is set yet — so choosing a fighter happens on the
poster and choosing a promotion in the studio. The shell stamps it on `<html data-mode>` with a
layout effect. Nothing else in the app branches on mode for styling.

### The token layers

`styles/tokens.css` holds the base palette (the neutral voice) plus **voice tokens** with neutral
defaults:

| Group | Tokens | What a mode does with them |
|---|---|---|
| Display type | `--font-display`, `--display-weight/-style/-transform/-tracking` | Anton on the poster; italic Barlow Condensed in the studio |
| Labels | `--label-weight/-tracking/-color` | Section titles and card headings |
| The slab | `--ink`, `--on-ink`, `--on-ink-muted`, `--on-ink-accent` | The surface that is the inverse of the page: the poster's black band, the broadcast's white plate. It inverts in dark themes |
| Shape | `--card-*`, `--feature-*`, `--btn-*`, `--chip-*`, `--tag-clip` | Square print and offset shadows vs. lit plates and slanted tags |
| Chrome | `--header-*`, `--nav-*`, `--title-size` | The poster's tab bar is the black band; the studio's is a control-room frame |
| Masthead | `--masthead-*`, `--stamp-*` | Printed off true with halftone and a red stamp vs. a lower-third cut under a gold rule |
| Texture | `--texture`, `--texture-size` | Newsprint grain vs. scanlines; a background image, never a colour |

`styles/modes/fighter.css` and `styles/modes/promoter.css` re-declare those for light and dark.
Their light block outranks the base light palette and follows the base dark block it ties with;
their dark blocks outrank both of the base's; and every token the base dark block sets is
re-declared in each mode's dark blocks — so a mode wins in all three theme states (the cascade
is spelled out at the top of `modes/fighter.css`). Every text/surface pair in both was checked at 4.5:1.

`theme-color` is read back from the resolved `--bg` rather than duplicated, because the
background now depends on two switches.

### Type

Self-hosted through `@fontsource` (Anton and Archivo; Barlow and Barlow Condensed), so the identity
survives offline and no launch is reported to a font CDN. Only the weights in use are imported,
and a face costs nothing until a page renders it.

### Icons

`ui/icons.tsx` replaces the emoji vocabulary with one stroke weight on one grid, in
`currentColor`. Emoji rendered as a different artist's drawing on every platform and carried
their own colours into palettes that did not choose them. Every icon is still decorative and
always paired with a word.

## The primitives this added

- **`Masthead`** — eyebrow, name, context, figures, stamp, on the slab. The name is one heading,
  so a screen reader hears it once. Inert, so a mode may rotate and clip it. Long titles step
  down a size automatically. Used by `FighterMasthead` (career hub and fighter page), the deal,
  the promotion dashboard and the card builder.
- **`ActionDock`** — the one decision a home screen asks for, docked above the tab bar on a phone
  and settled into the flow on a wide screen. Extracted from the career hub and now also used by
  the promotion dashboard, which leads with its most urgent actionable attention row.
- **`Card feature`** — the weight for the one card a screen leads with.
- **`AttentionRow lead` and tone tags** — severity is a word (Urgent, Soon, Note, Good) in a tag
  shaped by the mode, not a stripe. The row the model ranked first is drawn at feature weight.

## Navigation

Each mode names its own five places; Settings moved behind a gear in the header, which freed a tab
for what each mode was missing.

- **Fighter:** Career · Calendar · **Deal** · Inbox · World. The deal had no route of its own
  (doc 32 § 3.2).
- **Promoter:** Promotion · **Shows** · Roster · **Belts** · Inbox. Championships were a chip row
  on the dashboard; promoting them retired `PromoterSubNav` and the `SubNav` primitive.

## Screen changes that are UX rather than paint

- **The deal leads with the deal.** The market leads only when the fighter can act on it — as a
  free agent, which is the same gate the signing panel uses. It used to lead whenever anybody was
  calling, including for champions the belt holds in place.
- **One primary action per home screen.** The promotion dashboard's three "Plan a card" buttons
  became one docked action; the rest are secondary.
- **The belt is the headline of its division**, on a title plate, rather than a bold line the
  weight of the queue under it.
- **Chips are sentence case** in both modes. Many carry a clause, and uppercase made those the
  hardest text on screen to read.

## Coach mode

Designed, not built. The voice is the corner notebook: graph paper on a gym-mat ground, typed
data, handwritten notes in red marker, tactile buttons with a raised edge. Its number language is
ranges with error bars, matching doc 14's scouting accuracy, and its navigation is the stable —
a strip of fighters that *is* the primary nav. When coach mode is built it gets
`styles/modes/coach.css` against the same voice tokens; `VisualMode` already includes it.

## What is still open

- The fighter's calendar and the inbox take the mode's voice from tokens but have no bespoke
  layout yet (the "road" and "telegram" mockups).
- Fight night's feed keeps corner stripes on each line. Those are information (which corner
  acted), not decoration, and stay.
- A pre-existing formatting drift means `prettier --check` fails on files this work did not
  reformat; CI does not run it, and this change did not widen it.
