# MMA Sim

A mobile-first MMA simulation. Play as a **fighter**, a **coach** running a gym, or a
**promoter** running a company — in one shared world, against competing promotions.

Simple on the surface (15 attributes, one-thumb screens), deliberately deep underneath
(hidden athleticism, per-attribute potential, scouting uncertainty, game plans, heat).

## Quick start

```bash
npm install
npm test          # unit + integration + statistical
npm run dev       # the app (once packages/app exists)
```

## Commands

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm test`              | Fast tiers: unit, integration, statistical              |
| `npm run test:watch`    | Watch mode                                              |
| `npm run test:long`     | 20-in-game-year long-sim regression suite (slow)        |
| `npm run typecheck`     | Project-wide TypeScript build                           |
| `npm run lint`          | ESLint, incl. the determinism and layering rules        |
| `npm run format`        | Prettier                                                |

## Layout

```
docs/                 design documents — read 00 and 02 first
packages/engine/      pure deterministic sim: no deps, no I/O, no Math.random
packages/data/        light DB, repositories, seed rosters
packages/app/         React + Vite PWA, incl. the editor
tests/                integration, statistical and long-sim suites
```

## Design docs

Start with [00 — Vision](docs/00-vision.md) for the pillars, then
[02 — Attributes & Ratings](docs/02-attributes-and-ratings.md), which is the load-bearing
document: ratings are **absolute** (Power 78 is the same force in any division) and are read
through a **convex effect curve** so an all-time outlier feels categorically different from
a merely elite fighter.

[01 — Architecture](docs/01-architecture.md) covers package boundaries, determinism and the
testing tiers.

## Non-negotiables

- The engine is a pure function of `(state, inputs, seed)`. No `Math.random`, no `Date`, no
  I/O. Enforced by lint and tests.
- Ratings are absolute, never weight-class relative.
- Nothing derived is ever stored.
- Seed ratings are honest. Every fighter has a hole.
