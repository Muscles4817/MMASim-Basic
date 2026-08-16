# 11 — Editor

> Status: built. Fighters, promotions, gyms, coaches, referees, judges and the commentary
> booth are all editable.
>
> Everything except fighters is driven by a declarative schema in `app/src/game/editorSchema.ts`
> rather than by bespoke forms, so adding an editable type is a data change and every field
> gets the same validation, warning behaviour and labelling. Fighters keep their own screen:
> fifteen attributes, hidden potential, personality and traits do not fit a generic form.
>


## Principle: one definition of valid

The editor is **not a separate application**. It is a route group inside the app, operating
on the same repositories as the game. There is therefore exactly one definition of a valid
fighter, and no possibility of the editor producing something the simulator cannot run.

The alternative — a standalone tool writing its own JSON — guarantees drift the first time
the schema changes, and the drift shows up as a crash in the sim rather than an error in the
editor.

## Principle: warn, do not block

The editor **warns** on incoherent combinations and then lets the player do it anyway.

Deliberately incoherent people exist: a fighter with Discipline 90 and `Party Animal` is a
contradiction, and also describes several real careers. The editor's job is to make sure the
player knows they are doing it, not to have an opinion about whether they should.

The one place it silently corrects rather than warns is a potential ceiling below the current
rating, because that is not a creative choice — it is a value the rest of the engine treats
as impossible.

## Built: fighter editing

| Editable | Notes |
| -------- | ----- |
| All 15 attributes | Slider plus a number field. Both, because a slider alone cannot set an exact value and a number field alone is miserable on a phone. |
| Per-attribute potential ceilings | A second, fainter slider. Raised automatically if the rating passes it. |
| All 8 personality axes | Hidden in game, fully editable here |
| All 26 traits | Toggle chips, with conflict warnings |
| Division | Changing it changes **no ratings** — the screen says so, because it is the single most counter-intuitive consequence of absolute ratings |
| Walking weight | Which is what actually changes the cut |

Every slider is coloured by its rating band and labelled with the band name, so the editor
teaches the rating scale while it is being used.

### Save semantics

Changes are held in a local draft until saved, with an explicit Revert. Nothing is written
to the world until the player commits — an editor that live-writes every slider drag is both
slow and impossible to back out of.

## Designed: not yet built

### Promotion editor
Prestige, budget, buzz, divisions run, matchmaking aggression, narrative control. Editing
`matchmakingAggression` is the most interesting single control in the whole editor: it is
what makes one promotion protective and another reckless.

### Gym & coach editor
Coach competencies (Scouting, Game Planning, Development, Cornering) and specialisms. A
coach who is uniformly rated is a boring coach, so the editor should surface the spread the
way the fighter editor surfaces bands.

### Official editor
Referee stoppage trigger, stand-up speed, foul tolerance; judge bias vectors and consistency.

### Roster tools
- Create a fighter from scratch, seeded by `generateFighter()` so the result is coherent
  rather than blank.
- Duplicate an existing fighter as a starting point.
- Export and import a roster as JSON, through the same versioned envelope the save uses, so
  a shared roster survives schema migrations.

### Validation report
A whole-roster pass answering: does every fighter have an exploitable flaw? Is the rating
distribution sane? Is any division too thin to book? These are the same checks the seed
test suite runs, surfaced to the player editing their own world.

## Access

Gated behind a setting rather than a build flag. Players get the editor too — a management
game with a locked editor is a game with a much shorter life.
