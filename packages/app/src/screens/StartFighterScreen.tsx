/**
 * Choosing which fighter to be.
 *
 * The interaction principle doc 32 § 11.7 states as a rule: **selection is never a side effect of
 * navigation.** Clicking a row selects it for inspection and changes nothing; a career starts
 * only when a named control is pressed, and the panel says so while you browse.
 *
 * The old screen did the opposite. One tap on any of hundreds of rows called `updateWorld` and
 * navigated, and the confirmation that existed only fired when there was already a career to
 * lose — which on a fresh save, the flow this screen exists for, is never.
 *
 * The composition is `MasterDetail`, which is the one desktop layout that genuinely beats a
 * phone: the candidate list stays on screen while the preview swaps, so comparing two fighters is
 * a glance rather than two navigations. On a phone it is `list → preview → take control`, which
 * is a different composition of the same two regions rather than a stacked desktop.
 *
 * The preview is the real `FighterView` at `viewer="none"` — every fact the game has about a
 * fighter, in the page the rest of the app uses, with no career behind it. That reuse is the
 * whole reason Phase 5 pulled `useGame` out of it.
 */

import { useMemo, useState } from 'react';
import {
  abilityRead,
  careerArc,
  displayName,
  fighterAge,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, DataTable, Flag, MasterDetail, Segmented, type Column } from '../ui';
import { Alert } from '../ui/signals';
import { FighterView } from './FighterView';
import { activeDivisionPeers, clearTransientCareerState } from '../game/career';
import { contractStanding } from '../game/contracts';

type Filter = 'contenders' | 'prospects' | 'all';

export function StartFighterScreen() {
  const { db, world, updateWorld } = useGame();
  const { navigate } = useRouter();
  const [filter, setFilter] = useState<Filter>('contenders');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  const fighters = useMemo(() => {
    const all = db.fighters.findAll() as Fighter[];
    const term = search.trim().toLowerCase();
    const matches = (f: Fighter) =>
      term === '' ||
      `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term);

    return all
      .filter((f) => {
        if (!matches(f)) return false;
        // The three genuinely different games available: take a made fighter to a belt, build an
        // unknown from nothing, or browse. Kept verbatim from the old screen — the idea was good.
        if (filter === 'contenders') return f.reputation >= 60;
        if (filter === 'prospects') return f.reputation < 60;
        return true;
      })
      .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
  }, [db, filter, search]);

  const selected = selectedId
    ? (db.fighters.findById(selectedId) as Fighter | undefined)
    : undefined;

  /** The only place in this flow that writes `playerRole`. */
  const takeControl = (fighter: Fighter) => {
    // Bookings and the last result are keyed to the previous fighter. Left behind, the dashboard
    // offers to send the new fighter into the old one's booked bout.
    clearTransientCareerState();
    updateWorld({ playerRole: 'fighter', playerFighterId: fighter.id as string });
    navigate({ name: 'hub' });
  };

  const columns: Column<Fighter>[] = [
    {
      id: 'name',
      label: 'Fighter',
      render: (f) => displayName(f),
      sort: (a, b) => displayName(a).localeCompare(displayName(b)),
      onPhone: 'primary',
    },
    {
      id: 'division',
      label: 'Division',
      render: (f) => getDivision(f.divisionId).shortName,
      onPhone: 'secondary',
    },
    {
      id: 'age',
      label: 'Age',
      render: (f) => fighterAge(f, world.day),
      sort: (a, b) => fighterAge(a, world.day) - fighterAge(b, world.day),
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'record',
      label: 'Record',
      render: (f) => recordString(f.summary),
      onPhone: 'secondary',
    },
    {
      id: 'ability',
      label: 'Ability',
      title: 'A class, never a number — see the preview for the full ratings',
      render: (f) => {
        const ability = abilityRead(f.attributes);
        return <span className="faint">{ability.label}</span>;
      },
      sort: (a, b) => overallRating(a.attributes) - overallRating(b.attributes),
      onPhone: 'hidden',
    },
    {
      id: 'arc',
      label: 'Stage',
      render: (f) => {
        const arc = careerArc({ fighter: f, day: world.day });
        return (
          <Chip tone={arc.tone === 'good' ? 'positive' : arc.tone === 'bad' ? 'negative' : 'info'}>
            {arc.label}
          </Chip>
        );
      },
      onPhone: 'trailing',
    },
    {
      id: 'warning',
      label: '',
      title: 'A division with nobody left to fight is a career that locks up',
      render: (f) =>
        activeDivisionPeers(db, f) < 3 ? <Chip tone="warning">Thin division</Chip> : null,
      onPhone: 'trailing',
    },
  ];

  const list = (
    <>
      <Card>
        <div className="stack">
          <Button variant="primary" block onClick={() => navigate({ name: 'create' })}>
            Create your own fighter
          </Button>
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            Or take over somebody who already exists, below.
          </p>
        </div>
      </Card>

      <Card>
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
      </Card>

      {/* The count, announced. It changes as the player types, and a list that silently
          reorders under a filter tells a screen-reader user nothing at all. */}
      <p className="visually-hidden" aria-live="polite">
        {fighters.length} fighter{fighters.length === 1 ? '' : 's'} match
      </p>

      <Card flush title={`${fighters.length} fighter${fighters.length === 1 ? '' : 's'}`}>
        <DataTable
          rows={fighters.slice(0, LIST_CAP)}
          columns={columns}
          rowKey={(f) => f.id as string}
          caption="Fighters you could take over"
          onRowClick={(f) => {
            setSelectedId(f.id as string);
            setConfirming(false);
          }}
          isCurrent={(f) => (f.id as string) === selectedId}
          empty={<p className="muted prose">Nobody matches that. Try a different filter.</p>}
        />
      </Card>

      {fighters.length > LIST_CAP && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          Showing the first {LIST_CAP} of {fighters.length}. Search or filter to narrow it — a
          truncated list that reads as a complete one is worse than a slow one.
        </p>
      )}
    </>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }} data-testid="choose-fighter">
      <MasterDetail
        listLabel="Candidates"
        detailLabel="Preview"
        selected={selected !== undefined}
        onClear={() => {
          setSelectedId(undefined);
          setConfirming(false);
        }}
        list={list}
        placeholder={
          <Card>
            <p className="muted prose">
              Pick somebody to look at. You get their record, their ratings, what the career has
              already cost them and where they stand — and nothing starts until you say so.
            </p>
          </Card>
        }
        detail={
          selected && (
            <>
              <TakeControlPanel
                fighter={selected}
                db={db}
                day={world.day}
                confirming={confirming}
                replacing={world.playerFighterId !== undefined}
                onRequest={() => setConfirming(true)}
                onCancel={() => setConfirming(false)}
                onConfirm={() => takeControl(selected)}
              />
              {/*
                The real profile, at `viewer="none"`.

                No promoter context, no self disclosure, no "put them on a card" — the honest
                state for somebody nobody is yet. It is the same component the career uses, which
                is why there is nothing here to keep in sync with it.
              */}
              <FighterView db={db} day={world.day} fighter={selected} viewer="none" />
            </>
          )
        }
      />
    </div>
  );
}

/** Enough to browse; past this a search is faster than a scroll, and rendering 800 rows janks. */
const LIST_CAP = 60;

/**
 * The commitment, and everything about it that is not reversible.
 *
 * Above the profile rather than below it, because on a phone the profile is several screens long
 * and a control at the bottom of it is a control nobody reaches. The browsing state is stated
 * here rather than implied: a player who has just clicked a row needs to know that the click did
 * not do anything.
 */
function TakeControlPanel({
  fighter,
  db,
  day,
  confirming,
  replacing,
  onRequest,
  onCancel,
  onConfirm,
}: {
  fighter: Fighter;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  confirming: boolean;
  /** Whether there is already a career this would end. */
  replacing: boolean;
  onRequest(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const standing = contractStanding(db, fighter);
  const thin = activeDivisionPeers(db, fighter) < 3;

  return (
    <Card raised testId="take-control">
      <h2 style={{ fontSize: 'var(--text-xl)' }}>{displayName(fighter)}</h2>
      <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
        {getDivision(fighter.divisionId).name} · {fighterAge(fighter, day)} ·{' '}
        <Flag nationality={fighter.nationality} /> ·{' '}
        {standing.promotion ? standing.promotion.name : 'unsigned'}
      </p>

      {thin && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Alert tone="warn" title="Thin division">
            Almost nobody left here to fight. Careers in a division this shallow lock up, and
            waiting is the only way out of it.
          </Alert>
        </div>
      )}

      {confirming ? (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            {replacing
              ? 'Your booked fight and your last result are discarded. The fighter you are leaving stays in the world and carries on without you.'
              : `Everything from here is ${displayName(fighter)}'s career — their record, their body, and what is left of it.`}
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onConfirm}>
              Yes — take control of {displayName(fighter)}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Keep looking
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <Button variant="primary" onClick={onRequest}>
            Take control of {displayName(fighter)}
          </Button>
          <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
            You are browsing. Nothing starts until you press this.
          </p>
        </div>
      )}
    </Card>
  );
}
