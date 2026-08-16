# 09 — Data Layer

> Status: living document.

## The requirement

"A light DB to start with that we can easily convert to a proper one later."

The trap is writing straight against `localStorage` and discovering later that every screen
knows about JSON blobs. The fix is not a heavyweight ORM — it is one narrow interface that
both a JSON store and a real database can satisfy.

## Shape

```
     UI / engine
          │  works only against these
          ▼
 ┌──────────────────────┐
 │  Repository<T>       │  findById, findAll, query, upsert, remove, count
 └──────────┬───────────┘
            │
 ┌──────────▼───────────┐
 │  StorageAdapter      │  read(collection) / write(collection, rows)
 └──────────┬───────────┘
            │
   ┌────────┴─────────┬──────────────────┐
   ▼                  ▼                  ▼
MemoryAdapter   LocalStorageAdapter   (future) SqliteAdapter / IndexedDB
```

`Repository` is the only thing application code ever sees. It is deliberately small — the
seven methods above and nothing else — because every method added here is a method every
future backend must implement.

### Why not just use the world-state object?

The engine's world state is a plain object tree, and for simulation that is exactly right.
But the UI needs indexed lookups ("all lightweights under contract to promotion X, sorted by
ranking") thousands of times per session, and the editor needs to write single entities
without rewriting the world. The repository layer provides both without the engine ever
knowing it exists.

## Query model

Deliberately minimal, and expressible in SQL without a translation layer:

```ts
interface Query<T> {
  where?: Partial<Record<keyof T, unknown>>;   // equality only
  filter?: (row: T) => boolean;                // in-memory escape hatch
  sort?: { key: keyof T; dir?: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}
```

`where` maps to a SQL `WHERE`. `filter` does not — it is the escape hatch, and every use of
it is a thing a future SQL backend will have to fetch-and-filter. That is a deliberate
trade: it is visible in a grep, which "clever" query builders never are.

## Persistence & migration

Each collection is written as a JSON document under a versioned envelope:

```json
{ "schemaVersion": 3, "collection": "fighters", "rows": [ … ] }
```

`migrations.ts` holds an ordered list of `(from, to, migrate)` steps. On load, a save is
walked forward to the current version. A save that is *newer* than the code is refused
rather than guessed at.

The migration list is the thing that makes this "light DB" honest rather than a liability:
the seed roster and any player's save will outlive several schema changes.

## Save files

A save is one envelope containing every collection plus the world clock and root RNG seed.
Given the same seed and the same tick count, resuming reproduces the identical world — see
[01 — Architecture](./01-architecture.md) § Determinism.

## What lives here vs. in the engine

| Concern                                   | Package  |
| ----------------------------------------- | -------- |
| What a fighter *is*                        | engine   |
| Whether Fighter X exists and where         | data     |
| How a fight resolves                       | engine   |
| The roster, rankings cache, save file      | data     |
| Seed data (the 2020 snapshot)              | data     |

The seed roster lives in `data` — not `engine` — so the engine can be tested and reasoned
about without 800 fighters attached to it.
