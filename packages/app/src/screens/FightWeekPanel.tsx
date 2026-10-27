/**
 * Fight week on the card screen. Doc 34 A5.
 *
 * What the run-up to a card asks of the promoter: replacements for anybody who fell out, and the
 * press conference in the last week. Shown above the card from a month out, and only when there
 * is something in it — an empty "fight week" box on a quiet card is noise.
 *
 * The weigh-in has its panel here too (`WeighInPanel`), built against the shape C6 is adding to
 * `PlannedBout` and rendered by the card screen once that lands.
 */

import { useMemo } from 'react';
import {
  describeAcceptance,
  displayName,
  recordString,
  type EventPlan,
  type Fighter,
  type PlannedWeighIn,
  type PressChoice,
} from '@mmasim/engine';
import { Button, Card, Chip } from '../ui';
import { Alert } from '../ui/signals';
import { useToast } from '../ui/toast';
import { money } from '../ui/format';
import {
  FIGHT_WEEK_DAYS,
  placeBout,
  planName,
  replacementsFor,
  sendOffer,
  type PromoterContext,
} from '../game/plans';
import {
  PRESS_OPTIONS,
  RUN_UP_DAYS,
  holdPressConference,
  openWithdrawals,
  pressBlocker,
} from '../game/fightWeek';

export function FightWeekPanel({
  ctx,
  plan,
  onChange,
  onPress,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  /** A card edit: the slot filled with a short-notice replacement. */
  onChange(plan: EventPlan): void;
  /** The press conference was held and saved; the screen re-reads the card. */
  onPress(): void;
}) {
  const away = plan.day - ctx.day;
  const open = openWithdrawals(plan);
  const inFightWeek = away <= FIGHT_WEEK_DAYS && away >= 1;
  if (away > RUN_UP_DAYS || (open.length === 0 && !inFightWeek)) return null;

  return (
    <section className="stack" aria-label="Fight week" style={{ gap: 'var(--space-3)' }}>
      {open.map((w) => (
        <ReplacementMarket
          key={`${w.slotId}:${w.fighterId as string}`}
          ctx={ctx}
          plan={plan}
          slotId={w.slotId}
          note={w.note}
          opponentId={w.opponentId as string}
          divisionId={w.divisionId as string}
          onChange={onChange}
        />
      ))}
      {inFightWeek && <PressConferenceCard ctx={ctx} plan={plan} onPress={onPress} />}
    </section>
  );
}

/**
 * Somebody to step in, for the corner a withdrawal left waiting.
 *
 * Ranked by whether they will say yes (`replacementsFor`), because eleven days out a fighter who
 * stays ready is worth more than a better one who cannot make the weight. Inside fight week the
 * offer is answered on the spot; before it, on the corner's usual few days.
 */
function ReplacementMarket({
  ctx,
  plan,
  slotId,
  note,
  opponentId,
  divisionId,
  onChange,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  slotId: string;
  note: string;
  opponentId: string;
  divisionId: string;
  onChange(plan: EventPlan): void;
}) {
  const toast = useToast();
  const opponent = ctx.db.fighters.findById(opponentId) as Fighter | undefined;
  const slot = plan.slots.find((s) => s.id === slotId);
  const options = useMemo(
    () => (opponent && slot ? replacementsFor({ ctx, plan, slot, opponent, limit: 4 }) : []),
    [ctx, plan, slot, opponent],
  );
  if (!opponent || !slot) return null;
  const away = plan.day - ctx.day;
  const onTheSpot = away <= FIGHT_WEEK_DAYS;

  const offer = (replacement: Fighter) => {
    const placed = placeBout({
      plan,
      slotId,
      redId: opponentId,
      blueId: replacement.id as string,
      divisionId,
    });
    const sent = sendOffer({ ctx, plan: placed, slotId });
    if (!sent) return;
    onChange(sent.plan);
    const { outcome } = sent;
    toast(
      outcome.accepted
        ? `${displayName(replacement)} takes it. ${displayName(opponent)} has an opponent again.`
        : outcome.replyDay !== undefined
          ? `Offered. ${displayName(replacement)}'s corner will answer in ${outcome.replyDay - ctx.day} days.`
          : `${displayName(replacement)} said no. Try somebody else.`,
      outcome.accepted ? 'good' : outcome.replyDay !== undefined ? 'info' : 'warn',
    );
  };

  return (
    <Alert tone="danger" title={`${displayName(opponent)} needs an opponent, ${away} days out`}>
      <span className="stack" style={{ gap: 'var(--space-2)' }}>
        <span className="prose" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
          {note}{' '}
          {onTheSpot
            ? 'It is fight week, so whoever you call answers on the spot.'
            : 'Their corners answer in a few days, as usual.'}
        </span>
        {options.length === 0 ? (
          <span className="prose" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
            Nobody who could take it on this notice. The bout comes off unless somebody frees up.
          </span>
        ) : (
          options.map((o) => (
            <span
              key={o.fighter.id as string}
              className="row"
              style={{ justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}
            >
              <span style={{ fontSize: 'var(--text-sm)' }}>
                <strong>{displayName(o.fighter)}</strong> · {recordString(o.fighter.summary)} ·{' '}
                {money(o.cost)} · {describeAcceptance(o.acceptance)}
              </span>
              <Button size="sm" onClick={() => offer(o.fighter)}>
                {onTheSpot ? 'Call them' : 'Offer it'}
              </Button>
            </span>
          ))
        )}
      </span>
    </Alert>
  );
}

const PRESS_LABEL: Readonly<Record<PressChoice, string>> = {
  civil: 'Kept it civil',
  trashTalk: 'Let them talk',
  confrontation: 'Staged a face-off',
};

function PressConferenceCard({
  ctx,
  plan,
  onPress,
}: {
  ctx: PromoterContext;
  plan: EventPlan;
  onPress(): void;
}) {
  const toast = useToast();
  const held = plan.fightWeek?.press;
  const blocker = pressBlocker(plan, ctx.day);

  if (held) {
    return (
      <Card title="The press conference">
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <span className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            <Chip>{PRESS_LABEL[held.choice]}</Chip>
            {held.heatGained > 0 && <Chip tone="accent">Heat +{held.heatGained}</Chip>}
            {held.buzzDelta > 0 && <Chip tone="positive">Buzz +{held.buzzDelta}</Chip>}
            {held.scuffle && <Chip tone="negative">Scuffle · fined {money(held.fine)}</Chip>}
          </span>
          {held.lines.map((line) => (
            <p key={line} className="prose" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              {line}
            </p>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="The press conference">
      {blocker ? (
        <p className="muted prose" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          {blocker}
        </p>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <p className="muted prose" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            Once, this week. How do you want the main event to play it?
          </p>
          {PRESS_OPTIONS.map((option) => (
            <Button
              key={option.id}
              block
              variant={option.id === 'civil' ? 'secondary' : 'primary'}
              onClick={() => {
                const press = holdPressConference(ctx.db, plan.id, option.id);
                if (!press) return;
                onPress();
                toast(
                  press.scuffle
                    ? `It got physical. The commission fined ${money(press.fine)}, and everybody is talking about ${planName(ctx.db, plan)}.`
                    : `Done. Buzz +${press.buzzDelta}${press.heatGained > 0 ? `, and the heat is up ${press.heatGained}` : ''}.`,
                  press.scuffle ? 'warn' : 'good',
                );
              }}
            >
              <span className="stack" style={{ gap: 0, textAlign: 'left' }}>
                <span>{option.label}</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>{option.blurb}</span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

// --- The weigh-in (C6's, when it lands) ------------------------------------------------------------

/** `PlannedBout.weighIn`, as C6 added it. */
type BoutWeighIn = PlannedWeighIn;

/**
 * A missed weight on the day before the card: fight at a catchweight, with the purse penalty, or
 * call the bout off. Rendered by the card screen for any bout with a `weighIn` once C6 lands,
 * with `resolve` calling `resolveMissedWeight(db, planId, slotId, choice)`.
 */
export function WeighInPanel({
  weighIn,
  nameOf,
  resolve,
}: {
  weighIn: BoutWeighIn;
  nameOf(id: string): string;
  resolve(choice: 'catchweight' | 'cancel'): void;
}) {
  const missed = weighIn.results.filter((r) => !r.made);
  if (missed.length === 0) return null;

  return (
    <Alert tone="warn" title="Missed weight">
      <span className="stack" style={{ gap: 'var(--space-2)' }}>
        {missed.map((r) => (
          <span
            key={r.fighterId}
            className="prose"
            style={{ display: 'block', fontSize: 'var(--text-sm)' }}
          >
            {nameOf(r.fighterId)} missed the {r.limitLbs} lb limit
            {r.overLbs !== undefined ? ` by ${Math.round(r.overLbs * 10) / 10} lb` : ''}.
            {r.egregious && ' Not a bad cut — they barely tried.'}
            {r.forfeit > 0 && ` They forfeit ${money(r.forfeit)} of their purse to the opponent.`}
          </span>
        ))}
        {weighIn.choice ? (
          <span className="prose" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
            {weighIn.choice === 'catchweight'
              ? 'It goes ahead at a catchweight, with the purse penalty paid to the opponent.'
              : 'The bout is off.'}
          </span>
        ) : (
          <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              disabled={!weighIn.opponentAccepts}
              title={weighIn.opponentAccepts ? undefined : 'The opponent will not take it.'}
              onClick={() => resolve('catchweight')}
            >
              Fight at a catchweight
            </Button>
            <Button variant="ghost" onClick={() => resolve('cancel')}>
              Call the bout off
            </Button>
          </span>
        )}
        {!weighIn.opponentAccepts && !weighIn.choice && (
          <span className="prose" style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
            The opponent will not fight at a catchweight, so the only choice is to call it off.
          </span>
        )}
      </span>
    </Alert>
  );
}
