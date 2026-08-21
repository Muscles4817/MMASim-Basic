/**
 * One card, being built.
 *
 * The screen the whole rework is for. What it replaces opened with nine fights already chosen,
 * which meant the single most interesting decision in the mode — *who fights whom* — had been
 * made by the matchmaker before the player arrived, and their job was to disagree with it. That
 * is not promoting. It is proof-reading.
 *
 * So the card opens with holes in it and every hole is a decision:
 *
 *   1. Pick a slot.
 *   2. Pick who you want in it.
 *   3. Pick who you want opposite, from a list **grouped by what kind of fight it would be** —
 *      ranking appropriate, competitive, a prospect test, a build-up, commercially attractive,
 *      high risk — with the rank, the cost, the contract state, whether they will take it, and
 *      one sentence saying why the matchmaker put them there.
 *   4. Designate it, if a belt is in play.
 *   5. Pencil it in, or send the offer and find out.
 *
 * Autofill still exists and is now a tool rather than the game: it is scoped to a section, it
 * can hand back suggestions the player approves one at a time, and it never books anything that
 * was not asked for.
 *
 * A card lives for months. Nothing here runs the night except the button that says so, and that
 * button only appears when the date arrives.
 */

import { useMemo, useState } from 'react';
import {
  EVENT_SCALES,
  GROUP_LABEL,
  GROUP_ORDER,
  MATCH_INTENTS,
  TAG_LABEL,
  abilityRead,
  careerArc,
  describeAcceptance,
  displayName,
  eventScale,
  getDivision,
  planProgress,
  recordString,
  rescale,
  type CardPosition,
  type EventPlan,
  type Fighter,
  type FightNight,
  type MatchIntentId,
  type OpponentGroup,
  type PlanSlot,
  type Promotion,
  type TitleKind,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { Alert, Fact, KeyStat } from '../ui/signals';
import { Console, Ledger, LedgerRow, LedgerRule } from '../ui/console';
import { formatGameDay } from '../shell/Shell';
import { money } from '../ui/format';
import {
  FILL_SCOPES,
  acceptCounter,
  applySuggestion,
  cancelPlan,
  clearSlot,
  defaultIntentFor,
  describeOdds,
  forecastPlan,
  issuesFor,
  opponentsFor,
  placeBout,
  planById,
  promoterContext,
  rollWithdrawals,
  runPlan,
  savePlan,
  sendAllDrafts,
  sendOffer,
  subjectsFor,
  suggestFills,
  titleOptionsFor,
  type FillScope,
  type OpponentOption,
  type PromoterContext,
  type Suggestion,
  type SubjectOption,
  type Withdrawal,
} from '../game/plans';

/** What the player is doing to one slot right now. */
type SlotEditor =
  | { step: 'closed' }
  | { step: 'subject'; slotId: string }
  | { step: 'opponent'; slotId: string; subjectId: string }
  | { step: 'confirm'; slotId: string; subjectId: string; opponentId: string }
  | { step: 'review'; slotId: string };

const POSITION_LABEL: Record<CardPosition, string> = {
  mainEvent: 'Main event',
  coMain: 'Co-main',
  mainCard: 'Main card',
  prelim: 'Prelim',
};

export function PlanScreen({ id }: { id: string }) {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<SlotEditor>({ step: 'closed' });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [ran, setRan] = useState<
    { night: FightNight; profit: number; buzz: number; attendance: number } | undefined
  >();
  const [settings, setSettings] = useState(false);

  const plan = useMemo(() => planById(db, id), [db, id, version, world.day]);
  const ctx = useMemo(
    () => (promotion ? promoterContext({ db, promotion, day: world.day }) : undefined),
    [db, promotion, world.day, version],
  );

  const forecast = useMemo(
    () => (ctx && plan ? forecastPlan({ ctx, plan }) : undefined),
    [ctx, plan],
  );
  const issues = useMemo(() => (ctx && plan ? issuesFor({ ctx, plan }) : []), [ctx, plan]);

  if (!promotion || !ctx) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  if (ran) {
    return <TheMorningAfter ran={ran} db={db} onDone={() => navigate({ name: 'promotion' })} />;
  }

  if (!plan) {
    return (
      <Empty title="That card is gone">
        <Button variant="primary" onClick={() => navigate({ name: 'calendar' })}>
          Back to the calendar
        </Button>
      </Empty>
    );
  }

  const progress = planProgress(plan);
  const away = plan.day - world.day;
  const isFightNight = away <= 0;
  /** Bouts written into a slot that nobody has been asked about yet. */
  const pencilled = plan.slots.filter((s) => s.bout?.status === 'draft').length;

  /** Every mutation goes through here so the save and the re-read stay in step. */
  const update = (next: EventPlan) => {
    savePlan(db, next);
    commit();
    setVersion((v) => v + 1);
  };

  const openSlot = (slot: PlanSlot) =>
    setEditor(
      slot.bout ? { step: 'review', slotId: slot.id } : { step: 'subject', slotId: slot.id },
    );

  const runIt = () => {
    // Withdrawals first. Somebody falling out at the last minute is the promoter's most
    // authentic recurring emergency, and it now happens to a card that exists rather than
    // inside a modal bolted onto the announce button.
    const rolled = rollWithdrawals({ db, plan });
    if (rolled.withdrawals.length > 0) {
      update(rolled.plan);
      setWithdrawals(rolled.withdrawals);
      return;
    }
    const outcome = runPlan({ db, plan });
    commit();
    if (outcome) setRan(outcome);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/*
        The matchmaking flow sits above the card rather than below it.
        
        Tapping a slot opens a panel, and a panel that opens under a twelve-row board is a panel
        the player has to go looking for — worst on a desktop, where the board is a full column
        tall before the picker even starts.
      */}
      {editor.step !== 'closed' && (
        <SlotEditorPanel
          ctx={ctx}
          plan={plan}
          editor={editor}
          onEditor={setEditor}
          onChange={update}
        />
      )}

      <Console
        main={
          <>
            <Card raised>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <p className="section-title" style={{ margin: 0 }}>
                  {plan.name}
                </p>
                <Button size="sm" variant="ghost" onClick={() => setSettings((s) => !s)}>
                  {settings ? 'Done' : 'Card settings'}
                </Button>
              </div>
              <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                {formatGameDay(plan.day)} · {plan.city}, {plan.country} ·{' '}
                {eventScale(plan.scale).label}
                {isFightNight ? ' · tonight' : ` · in ${away} days`}
              </p>

              <div className="facts" style={{ marginTop: 'var(--space-3)' }}>
                <Fact
                  label="Agreed"
                  value={`${progress.agreed} / ${progress.slots}`}
                  tone={progress.complete ? 'good' : 'warn'}
                  emphasis="secondary"
                />
                <Fact
                  label="Main event"
                  value={progress.hasMainEvent ? 'Set' : 'Empty'}
                  tone={progress.hasMainEvent ? 'good' : 'bad'}
                  emphasis="secondary"
                />
                <Fact label="Offers out" value={progress.offered} emphasis="tertiary" />
              </div>

              {settings && (
                <CardSettings
                  plan={plan}
                  onChange={update}
                  onCancel={() => {
                    cancelPlan(db, plan.id);
                    commit();
                    navigate({ name: 'calendar' });
                  }}
                />
              )}
            </Card>

            {withdrawals.length > 0 && (
              <Alert tone="danger" title={`${withdrawals.length} pulled out`}>
                <span className="stack" style={{ gap: 'var(--space-1)' }}>
                  {withdrawals.map((w) => (
                    <span
                      key={w.slotId}
                      className="prose"
                      style={{ display: 'block', fontSize: 'var(--text-sm)' }}
                    >
                      {w.note}
                    </span>
                  ))}
                  <span className="prose" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                    Those slots are empty again. Find replacements, or run a shorter card — a thin
                    night is worth less at the gate, and nobody stays home over one missing prelim.
                  </span>
                </span>
              </Alert>
            )}

            {issues.length > 0 && !isFightNight && (
              <Alert
                tone={
                  issues[0]!.urgency >= 90 ? 'danger' : issues[0]!.urgency >= 60 ? 'warn' : 'info'
                }
                title={issues[0]!.message}
              >
                {issues.length > 1 && (
                  <span className="stack" style={{ gap: 'var(--space-1)' }}>
                    {issues.slice(1, 4).map((issue) => (
                      <span
                        key={issue.kind + issue.message}
                        className="prose"
                        style={{ display: 'block', fontSize: 'var(--text-sm)' }}
                      >
                        {issue.message}
                      </span>
                    ))}
                  </span>
                )}
              </Alert>
            )}

            {/* The card itself. Sections in the order a promoter fills them, holes included. */}
            {(['mainEvent', 'coMain', 'mainCard', 'prelim'] as const).map((position) => {
              const slots = plan.slots.filter((s) => s.position === position);
              if (slots.length === 0) return null;

              return (
                <Card key={position} title={POSITION_LABEL[position]}>
                  <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
                    {SECTION_PURPOSE[position]}
                  </p>
                  <div className="slots">
                    {slots.map((slot, i) => (
                      <SlotRow
                        key={slot.id}
                        ctx={ctx}
                        slot={slot}
                        ordinal={slots.length > 1 ? i + 1 : undefined}
                        onOpen={() => openSlot(slot)}
                      />
                    ))}
                  </div>
                </Card>
              );
            })}
          </>
        }
        side={
          <>
            {/*
              The night as a business proposition, updated as the card fills. A promoter deciding
              whether they can afford a main event needs the number beside the decision, not two
              screens away.
            */}
            {forecast && (
              <Card title="What this night is worth">
                <KeyStat
                  value={forecast.expectedAttendance.toLocaleString()}
                  label="Expected attendance"
                  detail={`${forecast.bouts} fights announced`}
                  tone={forecast.expectedAttendance < 2000 ? 'bad' : undefined}
                />
                <Ledger>
                  <LedgerRow label="Purses committed" value={money(forecast.purses)} />
                  <LedgerRow label="Bonus pool" value={money(forecast.bonusPool)} />
                  <LedgerRule />
                  <LedgerRow
                    label="Projected result"
                    value={money(forecast.projectedProfit)}
                    tone={forecast.projectedProfit >= 0 ? 'good' : 'bad'}
                  />
                </Ledger>
              </Card>
            )}

            {isFightNight ? (
              <Card title="Fight night">
                <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                  {progress.agreed === 0
                    ? 'Nothing on this card was ever agreed. There is no show to run.'
                    : `${progress.agreed} fights are signed. Anything still on offer does not happen.`}
                </p>
                <Button
                  variant="primary"
                  block
                  aria-disabled={progress.agreed === 0}
                  onClick={() => progress.agreed > 0 && runIt()}
                >
                  Run the card
                </Button>
              </Card>
            ) : (
              <>
                {/*
                  Gated on drafts, not on "filled but not agreed".
                  
                  A card where two bouts were turned down has more filled slots than agreed ones
                  and nothing left to send — the arithmetic version offered a button above the
                  sentence "0 bouts are pencilled in".
                */}
                {pencilled > 0 && (
                  <Card title="Send the offers">
                    <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                      {pencilled} {pencilled === 1 ? 'bout is' : 'bouts are'} pencilled in and
                      nobody has been asked yet. Both corners have to agree, and anybody who turns
                      it down leaves a hole.
                    </p>
                    <Button
                      variant="primary"
                      block
                      onClick={() => {
                        const result = sendAllDrafts({ ctx, plan });
                        update(result.plan);
                      }}
                    >
                      Send every pencilled fight
                    </Button>
                  </Card>
                )}

                <AutofillPanel
                  ctx={ctx}
                  plan={plan}
                  suggestions={suggestions}
                  onSuggest={setSuggestions}
                  onApply={(picked) => {
                    let next = plan;
                    for (const suggestion of picked) next = applySuggestion(next, suggestion);
                    update(next);
                    setSuggestions((current) =>
                      current.filter((s) => !picked.some((p) => p.slotId === s.slotId)),
                    );
                  }}
                />
              </>
            )}
          </>
        }
      />
    </div>
  );
}

/** A divisional place, in the words the sport uses. Position 0 is the champion, not "#0". */
const describeRank = (rank: number | undefined, isChampion = false): string =>
  isChampion || rank === 0 ? 'Champion' : rank !== undefined ? `#${rank}` : 'Unranked';

const SECTION_PURPOSE: Record<CardPosition, string> = {
  mainEvent: 'Sells the night. Everything else on the card is judged against it.',
  coMain: 'The insurance. If the main event falls apart, this is what you have left.',
  mainCard:
    'Where contenders are made and tested. Nobody buys the card for these; they remember them.',
  prelim:
    'Prospects, returns and people fighting for their job. Cheap, and where next year comes from.',
};

// --- One slot -------------------------------------------------------------------------------------

function SlotRow({
  ctx,
  slot,
  ordinal,
  onOpen,
}: {
  ctx: PromoterContext;
  slot: PlanSlot;
  /** Which bout this is within its section, when the section holds more than one. */
  ordinal?: number;
  onOpen(): void;
}) {
  const bout = slot.bout;
  const red = bout
    ? (ctx.db.fighters.findById(bout.redId as string) as Fighter | undefined)
    : undefined;
  const blue = bout
    ? (ctx.db.fighters.findById(bout.blueId as string) as Fighter | undefined)
    : undefined;

  const state = !bout
    ? 'empty'
    : bout.status === 'agreed'
      ? 'agreed'
      : bout.status === 'declined'
        ? 'declined'
        : bout.status === 'offered'
          ? 'offered'
          : 'draft';

  return (
    <button type="button" className={`slot slot--${state}`} onClick={onOpen}>
      {/* The section heading already says "Main card"; repeating it on every row inside it is
          noise. The ordinal is information, and the column keeps the rows aligned. */}
      <span className="slot__position">
        {ordinal === undefined ? POSITION_LABEL[slot.position] : `Bout ${ordinal}`}
      </span>
      <span className="slot__body">
        {bout && red && blue ? (
          <>
            <span className="slot__names">
              {displayName(red)} vs {displayName(blue)}
            </span>
            <span className="slot__meta">
              {recordString(red.summary)} vs {recordString(blue.summary)} ·{' '}
              {getDivision(bout.divisionId).name} · {bout.rounds} rounds
            </span>
            <span className="slot__chips">
              <Chip
                tone={
                  bout.status === 'agreed'
                    ? 'positive'
                    : bout.status === 'declined'
                      ? 'negative'
                      : bout.status === 'offered'
                        ? 'info'
                        : 'neutral'
                }
              >
                {bout.status === 'agreed'
                  ? 'Signed'
                  : bout.status === 'declined'
                    ? 'Turned down'
                    : bout.status === 'offered'
                      ? 'Offered'
                      : 'Pencilled in'}
              </Chip>
              {bout.titleKind && (
                <Chip tone="accent">
                  {bout.titleKind === 'undisputed'
                    ? 'Title fight'
                    : bout.titleKind === 'interim'
                      ? 'Interim title'
                      : 'Vacant title'}
                </Chip>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="slot__names muted">Empty</span>
            <span className="slot__meta">Tap to make a fight.</span>
          </>
        )}
      </span>
    </button>
  );
}

// --- Matchmaking ---------------------------------------------------------------------------------

function SlotEditorPanel({
  ctx,
  plan,
  editor,
  onEditor,
  onChange,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  editor: SlotEditor;
  onEditor(next: SlotEditor): void;
  onChange(plan: EventPlan): void;
}) {
  const slotId = 'slotId' in editor ? editor.slotId : undefined;
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot) return null;

  const close = () => onEditor({ step: 'closed' });

  if (editor.step === 'review') {
    return (
      <BookedBout
        ctx={ctx}
        plan={plan}
        slot={slot}
        onClose={close}
        onChange={onChange}
        onRebook={() => onEditor({ step: 'subject', slotId: slot.id })}
      />
    );
  }

  if (editor.step === 'subject') {
    return (
      <SubjectPicker
        ctx={ctx}
        plan={plan}
        slot={slot}
        onPick={(fighter) =>
          onEditor({ step: 'opponent', slotId: slot.id, subjectId: fighter.id as string })
        }
        onClose={close}
      />
    );
  }

  const subject = ctx.db.fighters.findById('subjectId' in editor ? editor.subjectId : '') as
    Fighter | undefined;
  if (!subject) return null;

  if (editor.step === 'opponent') {
    return (
      <OpponentPicker
        ctx={ctx}
        plan={plan}
        slot={slot}
        subject={subject}
        onBack={() => onEditor({ step: 'subject', slotId: slot.id })}
        onPick={(opponent) =>
          onEditor({
            step: 'confirm',
            slotId: slot.id,
            subjectId: subject.id as string,
            opponentId: opponent.id as string,
          })
        }
      />
    );
  }

  if (editor.step !== 'confirm') return null;
  const opponent = ctx.db.fighters.findById(editor.opponentId) as Fighter | undefined;
  if (!opponent) return null;

  return (
    <ConfirmBout
      ctx={ctx}
      plan={plan}
      slot={slot}
      red={subject}
      blue={opponent}
      onBack={() =>
        onEditor({ step: 'opponent', slotId: slot.id, subjectId: subject.id as string })
      }
      onDone={(next, keepOpen) => {
        onChange(next);
        onEditor(keepOpen ? { step: 'review', slotId: slot.id } : { step: 'closed' });
      }}
    />
  );
}

/**
 * Who goes in this slot first.
 *
 * Sorted by who has been waiting longest rather than alphabetically. A promoter filling a slot
 * is usually looking for somebody owed a fight, and when they want a specific person they type
 * the name — which is why the search is here and the sort is not by it.
 */
function SubjectPicker({
  ctx,
  plan,
  slot,
  onPick,
  onClose,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  onPick(fighter: Fighter): void;
  onClose(): void;
}) {
  const [search, setSearch] = useState('');
  const [divisionId, setDivisionId] = useState<string | undefined>();

  const divisions = useMemo(
    () => [...new Set(ctx.roster.map((f) => f.divisionId as string))].sort(),
    [ctx.roster],
  );

  const subjects = useMemo(
    () => subjectsFor({ ctx, plan, slotId: slot.id, divisionId, search }).slice(0, 40),
    [ctx, plan, slot.id, divisionId, search],
  );

  return (
    <Card
      title={`${POSITION_LABEL[slot.position]} — who do you want?`}
      action={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <input
          type="search"
          value={search}
          placeholder="Search your roster"
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search your roster"
          style={{
            minHeight: 'var(--tap-target)',
            padding: '0 var(--space-3)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        />

        <div className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant={divisionId === undefined ? 'primary' : 'secondary'}
            onClick={() => setDivisionId(undefined)}
          >
            All
          </Button>
          {divisions.map((id) => (
            <Button
              key={id}
              size="sm"
              variant={divisionId === id ? 'primary' : 'secondary'}
              onClick={() => setDivisionId(id)}
            >
              {getDivision(id as never).shortName}
            </Button>
          ))}
        </div>

        <div>
          {subjects.map((option) => (
            <SubjectRow key={option.fighter.id} ctx={ctx} option={option} onPick={onPick} />
          ))}
          {subjects.length === 0 && (
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
              Nobody on your roster matches that.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SubjectRow({
  ctx,
  option,
  onPick,
}: {
  ctx: PromoterContext;
  option: SubjectOption;
  onPick(fighter: Fighter): void;
}) {
  const { fighter, rank, isChampion, blocker, daysIdle } = option;
  const arc = careerArc({ fighter, day: ctx.day, rank, isChampion });

  return (
    <button
      type="button"
      className="candidate"
      data-blocked={blocker ? 'true' : undefined}
      onClick={() => !blocker && onPick(fighter)}
    >
      <span className="candidate__head">
        <span className="candidate__name">{displayName(fighter)}</span>
        <span className="candidate__rank">{describeRank(rank, isChampion)}</span>
      </span>
      <span className="candidate__line">
        {recordString(fighter.summary)} · {getDivision(fighter.divisionId).name} ·{' '}
        {Number.isFinite(daysIdle)
          ? `${Math.round(daysIdle)} days since a fight`
          : 'never fought here'}
      </span>
      <span className="candidate__chips">
        <Chip tone={arc.tone === 'good' ? 'positive' : arc.tone === 'bad' ? 'negative' : 'info'}>
          {arc.label}
        </Chip>
        {blocker && <Chip tone="warning">{blocker}</Chip>}
      </span>
    </button>
  );
}

/**
 * Who they fight, grouped by what kind of fight it would be.
 *
 * The alternative — one alphabetical list of everybody in the division — is what makes a
 * matchmaking screen feel like a database. A promoter is choosing between a title eliminator, a
 * step up and a showcase before they are choosing between two names, so the categories come
 * first and the names sit inside them.
 */
function OpponentPicker({
  ctx,
  plan,
  slot,
  subject,
  onBack,
  onPick,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  subject: Fighter;
  onBack(): void;
  onPick(fighter: Fighter): void;
}) {
  const [intent, setIntent] = useState<MatchIntentId>(() => defaultIntentFor(slot.position));
  const [crossDivision, setCrossDivision] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(
    () => opponentsFor({ ctx, plan, slot, subject, intent, crossDivision, search }),
    [ctx, plan, slot, subject, intent, crossDivision, search],
  );

  const grouped = useMemo(() => {
    const map = new Map<OpponentGroup, OpponentOption[]>();
    for (const option of options) {
      map.set(option.group, [...(map.get(option.group) ?? []), option]);
    }
    return GROUP_ORDER.map((group) => ({ group, rows: map.get(group) ?? [] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [options]);

  return (
    <Card
      title={`Who fights ${displayName(subject)}?`}
      action={
        <Button size="sm" variant="ghost" onClick={onBack}>
          Change fighter
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {/*
          The purpose picker. The list does not change when this changes — the *order and the
          headline* do, which is how a matchmaker's thinking actually works: the same fifteen
          fighters are a different shortlist depending on what you are trying to do.
        */}
        <div>
          <p className="section-title">What is this fight for?</p>
          <div className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {MATCH_INTENTS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={option.id === intent ? 'primary' : 'secondary'}
                onClick={() => setIntent(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
          >
            {MATCH_INTENTS.find((i) => i.id === intent)?.blurb}
          </p>
        </div>

        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            placeholder="Search"
            aria-label="Search opponents"
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: '8rem',
              minHeight: 'var(--tap-target)',
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
            }}
          />
          <Button
            size="sm"
            variant={crossDivision ? 'primary' : 'secondary'}
            onClick={() => setCrossDivision((v) => !v)}
          >
            {crossDivision ? 'Any division' : 'Same division'}
          </Button>
        </div>

        {grouped.length === 0 ? (
          <Alert tone="warn" title="Nobody available">
            Everybody who could take this fight is booked, suspended, or has fought them too
            recently.
          </Alert>
        ) : (
          grouped.map(({ group, rows }) => (
            <div key={group} className="picker__group">
              <p className="picker__group-title">{GROUP_LABEL[group]}</p>
              {rows.slice(0, 6).map((option) => (
                <OpponentRow key={option.fighter.id} option={option} onPick={onPick} />
              ))}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/**
 * One candidate, with everything the choice actually needs.
 *
 * Rank, record, availability, what they cost, what is left on their deal, whether they will say
 * yes, and one sentence explaining why the matchmaker put them in this category. That list is
 * the difference between choosing an opponent and picking a name off a roster.
 */
function OpponentRow({
  option,
  onPick,
}: {
  option: OpponentOption;
  onPick(fighter: Fighter): void;
}) {
  const { fighter, rank, appraisal, acceptance, concern, blocker, cost, contractNote } = option;
  const ability = abilityRead(fighter.attributes);

  return (
    <button
      type="button"
      className="candidate"
      data-blocked={blocker ? 'true' : undefined}
      onClick={() => !blocker && onPick(fighter)}
    >
      <span className="candidate__head">
        <span className="candidate__name">{displayName(fighter)}</span>
        <span className="candidate__rank">{describeRank(rank)}</span>
      </span>
      <span className="candidate__line">
        {recordString(fighter.summary)} · {ability.label} · {describeOdds(appraisal.redOdds)} ·{' '}
        {money(cost)}
      </span>
      {contractNote && <span className="candidate__line">{contractNote}</span>}
      <span className="candidate__why">{appraisal.rationale}</span>
      <span className="candidate__chips">
        <Chip tone={acceptance > 0.6 ? 'positive' : acceptance > 0.3 ? 'warning' : 'negative'}>
          {describeAcceptance(acceptance)}
        </Chip>
        {appraisal.tags.slice(0, 3).map((tag) => (
          <Chip key={tag} tone={tag === 'stylisticRisk' || tag === 'mismatch' ? 'warning' : 'info'}>
            {TAG_LABEL[tag]}
          </Chip>
        ))}
        {blocker && <Chip tone="negative">{blocker}</Chip>}
      </span>
      {concern && !blocker && (
        <span className="candidate__line" style={{ marginTop: 'var(--space-1)' }}>
          Reservation: {concern}
        </span>
      )}
    </button>
  );
}

/**
 * The last step: what kind of bout is this, and are you sending it now.
 *
 * Pencilling in and offering are deliberately two different buttons. A card is planned over
 * months and an offer made in January for an April fight is a different act from writing a name
 * into a slot — which is the whole reason the old builder, where placing a fight *was* booking
 * it, could not express planning at all.
 */
function ConfirmBout({
  ctx,
  plan,
  slot,
  red,
  blue,
  onBack,
  onDone,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  red: Fighter;
  blue: Fighter;
  onBack(): void;
  onDone(plan: EventPlan, keepOpen: boolean): void;
}) {
  const titleOptions = useMemo(
    () => titleOptionsFor({ ctx, red, blue, plan }),
    [ctx, red, blue, plan],
  );
  const [titleKind, setTitleKind] = useState<TitleKind | undefined>();

  const place = () =>
    placeBout({
      plan,
      slotId: slot.id,
      redId: red.id as string,
      blueId: blue.id as string,
      divisionId: red.divisionId as string,
      titleKind,
    });

  return (
    <Card
      title={`${displayName(red)} vs ${displayName(blue)}`}
      action={
        <Button size="sm" variant="ghost" onClick={onBack}>
          Change opponent
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {POSITION_LABEL[slot.position]} · {getDivision(red.divisionId).name} ·{' '}
          {red.divisionId === blue.divisionId ? 'same division' : 'catchweight'}
        </p>

        <div>
          <p className="section-title">Is this for a belt?</p>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="bout"
              style={
                titleKind === undefined
                  ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                  : undefined
              }
              onClick={() => setTitleKind(undefined)}
            >
              <span className="bout__names">No — a normal bout</span>
              <span className="list__secondary" style={{ display: 'block' }}>
                Three rounds, no belt on the line.
              </span>
            </button>
            {titleOptions.map((option) => (
              <button
                key={option.kind}
                type="button"
                className="bout"
                data-blocked={option.available ? undefined : 'true'}
                style={{
                  ...(titleKind === option.kind
                    ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                    : {}),
                  ...(option.available ? {} : { opacity: 0.55, cursor: 'not-allowed' }),
                }}
                onClick={() => option.available && setTitleKind(option.kind)}
              >
                <span className="bout__names">{option.label}</span>
                <span className="list__secondary" style={{ display: 'block' }}>
                  {option.reason}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <Button variant="primary" block onClick={() => onDone(place(), false)}>
            Pencil it in
          </Button>
          <Button
            block
            onClick={() => {
              const placed = place();
              const result = sendOffer({ ctx, plan: placed, slotId: slot.id });
              onDone(result?.plan ?? placed, true);
            }}
          >
            Send the offer now
          </Button>
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            Pencilling in commits nothing — you can hold the fight for weeks and offer it when the
            card is closer. Sending it asks both corners, and either of them can say no.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** A slot that already holds a fight: what happened, and what to do about it. */
function BookedBout({
  ctx,
  plan,
  slot,
  onClose,
  onChange,
  onRebook,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  onClose(): void;
  onChange(plan: EventPlan): void;
  onRebook(): void;
}) {
  const bout = slot.bout;
  if (!bout) return null;

  const red = ctx.db.fighters.findById(bout.redId as string) as Fighter | undefined;
  const blue = ctx.db.fighters.findById(bout.blueId as string) as Fighter | undefined;
  if (!red || !blue) return null;

  const counters = (bout.answers ?? []).filter((a) => a.verdict === 'countered');
  const refusals = (bout.answers ?? []).filter((a) => a.verdict === 'declined');
  const ask = counters.reduce((sum, c) => sum + (c.askingPurse ?? 0), 0);

  const nameOf = (id: string) => {
    const fighter = ctx.db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Somebody';
  };

  return (
    <Card
      title={`${displayName(red)} vs ${displayName(blue)}`}
      action={
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {POSITION_LABEL[slot.position]} · {getDivision(bout.divisionId).name} · {bout.rounds}{' '}
          rounds
          {bout.titleKind ? ` · ${bout.titleKind} title` : ''}
        </p>

        {(bout.answers ?? []).length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            {(bout.answers ?? []).map((answer) => (
              <p
                key={answer.fighterId as string}
                className="prose"
                style={{ fontSize: 'var(--text-sm)', margin: 0 }}
              >
                <strong>{nameOf(answer.fighterId as string)}</strong> — {answer.note}
                {answer.askingPurse !== undefined && ` (${money(answer.askingPurse)})`}
              </p>
            ))}
          </div>
        )}

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {bout.status === 'draft' && (
            <Button
              variant="primary"
              block
              onClick={() => {
                const result = sendOffer({ ctx, plan, slotId: slot.id });
                if (result) onChange(result.plan);
              }}
            >
              Send the offer
            </Button>
          )}

          {/*
            Meeting the ask. The negotiation the mode never had: a fighter who wanted more money
            used to be an unfillable slot, and now it is a price the player can decide is worth
            paying. Somebody who flatly refused cannot be bought, which is what keeps a refusal
            meaningful.
          */}
          {counters.length > 0 && refusals.length === 0 && (
            <Button
              variant="primary"
              block
              onClick={() => onChange(acceptCounter({ ctx, plan, slotId: slot.id }))}
            >
              Pay {money(ask)} and close it
            </Button>
          )}

          <Button block onClick={onRebook}>
            Book somebody else
          </Button>
          <Button variant="ghost" block onClick={() => onChange(clearSlot(plan, slot.id))}>
            Empty the slot
          </Button>
        </div>
      </div>
    </Card>
  );
}

// --- Autofill --------------------------------------------------------------------------------------

/**
 * Autofill, scoped and optional.
 *
 * The old version ran before the screen had rendered and filled all nine slots. This one does
 * nothing until asked, does only the section it was asked about, and — the important part —
 * defaults to handing back *suggestions* the player approves one at a time. A promoter who wants
 * to book the main event, the co-main and two prospect fights themselves and let the matchmaker
 * handle the undercard can do exactly that, which is the actual shape of the job.
 */
function AutofillPanel({
  ctx,
  plan,
  suggestions,
  onSuggest,
  onApply,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  suggestions: readonly Suggestion[];
  onSuggest(next: Suggestion[]): void;
  onApply(picked: Suggestion[]): void;
}) {
  const [scope, setScope] = useState<FillScope>('all');

  return (
    <Card title="Let the matchmaker help">
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {/*
          A chip row rather than a segmented control. `Segmented` renders every option's hint
          beneath its label, which is right for two or three choices and turns five into five
          columns of vertical text in a side column — so the hint moves to a single line under
          whichever is selected.
        */}
        <div className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {FILL_SCOPES.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={option.id === scope ? 'primary' : 'secondary'}
              onClick={() => setScope(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {FILL_SCOPES.find((s) => s.id === scope)?.blurb}
        </p>

        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button onClick={() => onSuggest(suggestFills({ ctx, plan, scope }))}>
            Suggest fights
          </Button>
          <Button variant="secondary" onClick={() => onApply(suggestFills({ ctx, plan, scope }))}>
            Fill them in
          </Button>
        </div>

        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          Suggestions are shown for you to approve one at a time. Filling them in pencils every one
          straight onto the card — it still does not offer anybody anything.
        </p>

        {suggestions.length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {suggestions.map((suggestion) => {
              const red = ctx.db.fighters.findById(suggestion.redId) as Fighter | undefined;
              const blue = ctx.db.fighters.findById(suggestion.blueId) as Fighter | undefined;
              if (!red || !blue) return null;
              return (
                <button
                  key={suggestion.slotId}
                  type="button"
                  className="bout bout--option"
                  onClick={() => onApply([suggestion])}
                >
                  <span className="bout__names">
                    {displayName(red)} vs {displayName(blue)}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {POSITION_LABEL[suggestion.position]} · {money(suggestion.cost)} ·{' '}
                    {describeAcceptance(suggestion.acceptance)}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {suggestion.appraisal.rationale}
                  </span>
                </button>
              );
            })}
            <Button variant="ghost" block onClick={() => onSuggest([])}>
              Dismiss these
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// --- Card settings ------------------------------------------------------------------------------------

function CardSettings({
  plan,
  onChange,
  onCancel,
}: {
  plan: EventPlan;
  onChange(plan: EventPlan): void;
  onCancel(): void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
      <Segmented
        label="How big a night"
        value={plan.scale}
        onChange={(scale) => {
          // Shrinking a card that already has fights on it drops the bottom of the undercard,
          // and the player should be told rather than surprised — so the count comes back and
          // the confirmation says it before anything is written.
          const result = rescale(plan, scale);
          onChange(result.plan);
        }}
        options={EVENT_SCALES.map((s) => ({ value: s.id, label: s.label, hint: s.blurb }))}
      />
      <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
        Making a card smaller drops the fights at the bottom of the undercard. Making it bigger adds
        empty slots you can fill whenever you like.
      </p>

      {confirming ? (
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="danger" onClick={onCancel}>
            Yes — cancel {plan.name}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          Cancel this card
        </Button>
      )}
    </div>
  );
}

// --- After the night ------------------------------------------------------------------------------------

function TheMorningAfter({
  ran,
  db,
  onDone,
}: {
  ran: { night: FightNight; profit: number; buzz: number; attendance: number };
  db: ReturnType<typeof useGame>['db'];
  onDone(): void;
}) {
  const name = (id: string) => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Unknown';
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">{ran.night.name}</p>
        <KeyStat
          value={money(ran.profit)}
          label={ran.profit >= 0 ? 'The night made money' : 'The night lost money'}
          tone={ran.profit >= 0 ? 'good' : 'bad'}
          detail={`${ran.attendance.toLocaleString()} in the building. ${describeBuzz(ran.buzz)}`}
        />
      </Card>

      <Card flush title="What happened">
        <div className="list">
          {ran.night.bouts.map((bout) => (
            <div key={bout.boutId} className="list__item" style={{ cursor: 'default' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="list__primary" style={{ display: 'block' }}>
                  {name(bout.redId as string)} vs {name(bout.blueId as string)}
                </span>
                <span className="list__secondary" style={{ display: 'block' }}>
                  {POSITION_LABEL[bout.position]}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Button variant="primary" block onClick={onDone}>
        Back to the promotion
      </Button>
    </div>
  );
}

const describeBuzz = (delta: number): string =>
  delta > 0.5
    ? 'People are talking about it.'
    : delta < -0.5
      ? 'It did not land.'
      : 'About what people expected of you.';
