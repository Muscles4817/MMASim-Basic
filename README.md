# MMA Sim

A mobile-first MMA simulation. Play as a **fighter**, a **coach** running a gym, or a
**promoter** running a company — in one shared world, against competing promotions.

Simple on the surface (15 attributes, one-thumb screens), deliberately deep underneath
(hidden athleticism, per-attribute potential, scouting uncertainty, game plans, heat).

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit + integration + statistical + playability
```

### In VS Code

Press **F5**, or pick **Play MMA Sim** in Run and Debug. That starts the dev server, waits
for it to be listening, then opens a browser attached to the debugger — breakpoints in
`.tsx` files work directly. There are also configurations for debugging each test tier.

## Commands

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Start the game at http://localhost:5173                 |
| `npm test`              | Fast tiers: unit, integration, statistical, playability |
| `npm run test:ui`       | Just the playability suite (mounts the real app)        |
| `npm run test:watch`    | Watch mode                                              |
| `npm run test:long`     | 20-in-game-year long-sim regression suite (slow)        |
| `npm run typecheck`     | Project-wide TypeScript build                           |
| `npm run lint`          | ESLint, incl. the determinism and layering rules        |
| `npm run format`        | Prettier                                                |

## Playing it on a phone

Pushing to `master` builds and publishes the app to GitHub Pages —
**https://muscles4817.github.io/MMASim-Basic/** — after typecheck and the full suite pass. A build
that ships a broken game is worse than one that fails loudly, so the gate is deliberate and the
deploy takes a few minutes.

It installs: open it on a phone and use *Add to Home Screen*. The service worker caches the shell,
so it opens and plays with no connection, and saves live in the device's **IndexedDB** — which is
storage on the phone itself, sized against free disk rather than the fixed ~5 MB `localStorage`
gives an origin. A save made before that change moves itself across the first time it is opened.
Nothing is synced between devices — a save made on a phone stays on that phone.

The build is base-path agnostic (`VITE_BASE`), so it works served from a domain root or from a
project subpath. To reproduce a Pages build locally:

```bash
VITE_BASE=/MMASim-Basic/ npm run build --workspace @mmasim/app
```

## Layout

```
docs/                 design documents — read 00 and 02 first
packages/engine/      pure deterministic sim: no deps, no I/O, no Math.random
packages/data/        light DB, repositories, seed rosters
packages/app/         React + Vite PWA, incl. the editor
tests/                integration, statistical, playability and long-sim suites
```

## Design docs

Start with [00 — Vision](docs/00-vision.md) for the pillars, then
[02 — Attributes & Ratings](docs/02-attributes-and-ratings.md), which is the load-bearing
document: ratings are **absolute** (Power 78 is the same force in any division) and are read
through a **convex effect curve** so an all-time outlier feels categorically different from
a merely elite fighter.

[01 — Architecture](docs/01-architecture.md) covers package boundaries, determinism and the
testing tiers.

[29 — Promoter Mode UX](docs/29-promoter-mode-ux.md) covers the promoter rework: cards are
planned months ahead with holes in them, matchmaking is a sequence of the player's own decisions,
and the dashboard surfaces situations rather than describing entities.

[31 — The physical ladder](docs/31-the-physical-ladder.md) is doc 02's missing half and is
**design, not yet built**: what Power 74 actually means. Each physical rating is defined as a
logarithmic scale over a measurable quantity with an allometric mass exponent, so the divisional
distributions are derived rather than authored — and heavyweight becomes genuinely more dangerous
than flyweight, by roughly the margin the real sport shows.

Two open plans: [19 — Fight engine](docs/19-fight-engine-plan.md) (phases 0 and 1 landed) and
[20 — Persistence and save size](docs/20-persistence-and-save-size.md), whose phase 2 has landed:
saves are in IndexedDB, so the 5 MB ceiling that stopped the app starting on a phone is gone. The
save itself is still 2.80 MB fresh, almost all of it a roster the game can rebuild from a seed —
which is what phases 3 to 5 are for.

## Non-negotiables

- The engine is a pure function of `(state, inputs, seed)`. No `Math.random`, no `Date`, no
  I/O. Enforced by lint and tests.
- Ratings are absolute, never weight-class relative.
- Nothing derived is ever stored. *(Doc 20 §1.1: the seed roster is the one place this is
  broken, and it costs 2.73 MB per save.)*
- Seed ratings are honest. Every fighter has a hole.
