import { useMemo, useState } from 'react';
import {
  displayName,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem, Segmented } from '../ui';
import { Alert, OverallRating } from '../ui/signals';
import { activeDivisionPeers, clearTransientCareerState } from '../game/career';

type Filter = 'contenders' | 'prospects' | 'all';

/**
 * Choose who to play as.
 *
 * The three filters are the three genuinely different games available: taking a made
 * fighter to a belt, building an unknown from nothing, or browsing. `prospects` is
 * deliberately listed second and described honestly — it is the harder, better run.
 */
export function StartScreen() {
  const { db, world, updateWorld } = useGame();
  const { navigate } = useRouter();
  const [filter, setFilter] = useState<Filter>('contenders');
  const [search, setSearch] = useState('');

  const fighters = useMemo(() => {
    const all = db.fighters.findAll() as Fighter[];
    const term = search.trim().toLowerCase();
    const matches = (f: Fighter) =>
      term === '' || `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term);

    const filtered = all.filter((f) => {
      if (!matches(f)) return false;
      if (filter === 'contenders') return f.reputation >= 60;
      if (filter === 'prospects') return f.reputation < 60;
      return true;
    });

    return filtered.sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
  }, [db, filter, search]);

  /*
   * Taking over somebody is career-ending for whoever you were.
   *
   * The list reads as browsable — the card above it says "or take over an existing fighter",
   * and it is reached from a plain button in Settings — but a single tap on any of hundreds
   * of rows discarded the current booking and reassigned the player, with no confirmation and
   * no undo. Settings gives its reset a full two-step; this is the same magnitude of action
   * and had none.
   *
   * Only guarded when there *is* a career to lose: confirming this on a fresh save would be
   * a dialog in front of the only thing the screen is for.
   */
  const [pending, setPending] = useState<Fighter | undefined>();

  /*
   * The promotions a player can start at.
   *
   * Regional only. The plan's reasoning, kept here because it is a design decision rather than
   * a filter: at the top of the sport phases three and four do not bite — a promotion with a
   * £62m budget does not feel payroll and cannot plausibly lose its broadcaster — so starting
   * there would mean shipping a mode whose pressure systems are inert.
   */
  const regionals = useMemo(
    () =>
      (db.promotions.findAll() as unknown as Promotion[])
        .filter((p) => p.tier === 'regional')
        .sort((a, b) => b.prestige - a.prestige),
    [db],
  );

  const takeOver = (promotion: Promotion) => {
    clearTransientCareerState();
    updateWorld({
      playerRole: 'promoter',
      playerPromotionId: promotion.id as string,
      playerFighterId: undefined,
    });
    navigate({ name: 'promotion' });
  };

  const commitChoice = (fighter: Fighter) => {
    // Bookings and the last result are keyed to the previous fighter. Left behind, the hub
    // offers to send the new fighter into the old one’s booked bout.
    clearTransientCareerState();
    updateWorld({ playerRole: 'fighter', playerFighterId: fighter.id as string });
    navigate({ name: 'hub' });
  };

  const choose = (fighter: Fighter) => {
    if (world.playerFighterId && world.playerFighterId !== (fighter.id as string)) {
      setPending(fighter);
      return;
    }
    commitChoice(fighter);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/*
        The primary path, and it was previously unreachable.

        App.tsx redirects the hub to this screen whenever there is no player fighter, and the
        only link to the creator lived in the hub's empty state — which that redirect
        guarantees nobody ever sees. Creating your own fighter and climbing with them is the
        point of the mode, so it is the largest thing on the landing screen.
      */}
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
          Start a career
        </h2>
        <p className="muted prose" style={{ marginBottom: 'var(--space-4)' }}>
          Build a fighter from nothing and take them as far as they can go — or take over
          somebody who already exists and see if you can do better with them.
        </p>
        <Button variant="primary" block onClick={() => navigate({ name: 'create' })}>
          Create your own fighter
        </Button>
      </Card>

      {/*
        The other side of the sport.
        
        `playerRole` has existed in the data layer since the beginning and was written twice,
        always to 'fighter', and read nowhere. This is the first thing that reads it.
        
        Regional only, and stated as a choice about which problem you want rather than a
        difficulty setting: at the top of the sport payroll does not bite and a broadcaster
        cannot plausibly drop you, so the pressure systems that make the mode a game are inert
        there.
      */}
      <Card>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
          Or run a promotion
        </h2>
        <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          You decide who fights whom, who gets pushed and who gets cut. Make money or make the
          sport — you will not do both.
        </p>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {regionals.map((promotion) => (
            <button
              key={promotion.id}
              type="button"
              className="bout"
              onClick={() => takeOver(promotion)}
            >
              <span className="bout__names">{promotion.name}</span>
              <span className="list__secondary" style={{ display: 'block' }}>
                {promotion.baseCountry} · £{Math.round(promotion.budget).toLocaleString()}k to
                spend · {promotion.notes}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
          Or take over an existing fighter
        </h2>
        <p className="muted prose" style={{ marginBottom: 'var(--space-4)' }}>
          January 2020. Every rating here is a judgement call, and every fighter has something
          an opponent can build a game plan around — including you.
        </p>

        <div className="stack">
          <Segmented
            label="Filter fighters"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'contenders', label: 'Contenders', hint: 'Established names' },
              { value: 'prospects', label: 'Prospects', hint: 'Harder, and more room to grow' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
          <label>
            <span className="visually-hidden">Search fighters by name</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="field"
            />
          </label>
        </div>

        <Button
          variant="ghost"
          block
          onClick={() => navigate({ name: 'roster' })}
          style={{ marginTop: 'var(--space-3)' }}
        >
          Just browse the roster instead
        </Button>
      </Card>

      {pending && (
        <Alert tone="warn" title={`Leave your current career for ${displayName(pending)}?`}>
          <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            Your booked fight and your last result are discarded. The fighter you are leaving
            stays in the world and carries on without you.
          </span>
          <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => commitChoice(pending)}>
              Yes — take over {displayName(pending)}
            </Button>
            <Button variant="ghost" onClick={() => setPending(undefined)}>
              Stay where I am
            </Button>
          </span>
        </Alert>
      )}

      {/*
        The count, announced. It changes as the player types into the search above it, and a
        list that silently reorders under a filter tells a screen-reader user nothing at all.
      */}
      <p className="visually-hidden" aria-live="polite">
        {fighters.length} fighter{fighters.length === 1 ? '' : 's'} match
      </p>

      <Card flush title={`${fighters.length} fighter${fighters.length === 1 ? '' : 's'}`}>
        {fighters.length === 0 ? (
          <Empty title="Nobody matches that">Try a different filter or clear the search.</Empty>
        ) : (
          <div className="list">
            {fighters.map((f) => (
              <ListItem
                key={f.id}
                onClick={() => choose(f)}
                primary={displayName(f)}
                secondary={
                  <>
                    {getDivision(f.divisionId).shortName} · {recordString(f.summary)} ·{' '}
                    {f.nationality}
                  </>
                }
                trailing={
                  // Wrapping and non-shrinking: three nowrap chips need ~190px of the 264px
                  // available at 320px, which left the name about sixty pixels and pushed it
                  // out of the row entirely.
                  <span
                    className="row"
                    style={{
                      gap: 'var(--space-2)',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                      flex: '0 0 auto',
                    }}
                  >
                    {activeDivisionPeers(db, f) < 3 && (
                      <Chip tone="warning">Thin division</Chip>
                    )}
                    <Chip tone={f.starPower >= 65 ? 'accent' : 'neutral'}>
                      <span className="visually-hidden">Star power </span>★ {f.starPower}
                    </Chip>
                    {/*
                      `OverallRating`, not a bare number. A sighted player saw "81" with no
                      scale, no band word and no legend anywhere on the screen — and the
                      visually-hidden label meant the *visual* reader was the one left
                      guessing. Roster and Rankings already use this; the first screen a new
                      player sees did not.
                    */}
                    <OverallRating rating={overallRating(f.attributes)} />
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}
