/**
 * What a camp did.
 *
 * The report used to be a card appended below the training form: to read it you scrolled past
 * the controls you had just used, and it competed for attention with a division picker and a gym
 * list that were still sitting on screen. On the one screen in the game that consumes months of a
 * career in a single click, the outcome of that click was a footnote.
 *
 * So it takes the screen. A camp is an event — the player pressed a button and three months of
 * their life happened — and it gets read once, deliberately, and then dismissed back to the
 * career. Everything here is the answer to a question a player actually asks: what am I now, how
 * much better did that make me, is there any point doing it again, and what did it cost me.
 */

import { formatGameDay } from '../shell/Shell';
import { Button, Card, Chip } from '../ui';
import { Alert, Trend } from '../ui/signals';
import { money } from '../ui/format';
import { ATTRIBUTE_META, type AttributeKey } from '@mmasim/engine';
import type { TrainingOutcome } from '../game/progression';

export function CampReport({
  outcome,
  day,
  onDone,
  onAgain,
}: {
  outcome: TrainingOutcome;
  day: number;
  onDone(): void;
  onAgain(): void;
}) {
  const grew = (Object.entries(outcome.gains) as [AttributeKey, number][])
    .filter(([, delta]) => delta !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const weeks = Math.round(outcome.days / 7);
  const total = grew.reduce((sum, [, d]) => sum + d, 0);
  const birthday =
    outcome.ageBefore !== undefined &&
    outcome.ageAfter !== undefined &&
    outcome.ageAfter > outcome.ageBefore;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* The injury leads, because it changes what the player does next and nothing else here does. */}
      {outcome.injury && (
        <Alert tone="danger" title="You picked up an injury in camp">
          {outcome.notes[0]}
        </Alert>
      )}

      <Card title="Camp report" role="status" raised>
        <p style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }}>
          {weeks} {weeks === 1 ? 'week' : 'weeks'} of work.
        </p>
        <p className="muted">
          It is {formatGameDay(day)} and you are {outcome.ageAfter}
          {birthday && ' — you had a birthday in camp'}.
        </p>

        <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/*
            The headline number. A list of six small deltas does not answer "was that camp worth
            it", and a single total does.
          */}
          <Chip tone={total > 0 ? 'positive' : 'neutral'}>
            {total > 0 ? `+${Math.round(total * 10) / 10}` : '0'} rating points gained
          </Chip>
          {outcome.cost !== undefined && <Chip tone="neutral">{money(outcome.cost)} spent</Chip>}
          {outcome.bankAfter !== undefined && (
            <Chip tone={outcome.bankAfter < 0 ? 'warning' : 'neutral'}>
              {money(outcome.bankAfter)} left
            </Chip>
          )}
        </div>
      </Card>

      <Card title="What improved">
        {grew.length === 0 ? (
          <p className="muted prose">
            Nothing measurable moved. That is not a bug and it is not always your fault — a poor
            room, no head coach, or an attribute already near your ceiling will all do it. The
            camp still aged you and still cost you money, which is why the choice of where to
            train matters.
          </p>
        ) : (
          <ul className="gains">
            {grew.map(([key, delta]) => {
              const from = outcome.before?.[key];
              const to = outcome.after?.[key];
              const room = outcome.headroom?.[key];
              return (
                <li key={key} className="gains__row">
                  <span className="gains__name">{ATTRIBUTE_META[key].label}</span>
                  {/*
                    Where it landed, not only how far it moved. "+2" is meaningless without
                    knowing whether that is 40 to 42 or 88 to 90.
                  */}
                  <span className="gains__value">
                    {from !== undefined && to !== undefined ? (
                      <>
                        <span className="muted">{from}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="visually-hidden"> up to </span>
                        <strong>{to}</strong>
                      </>
                    ) : (
                      <strong>{to ?? '—'}</strong>
                    )}
                  </span>
                  <Trend delta={delta} />
                  {/*
                    Why the next camp will pay less. A player watching gains shrink has no way to
                    tell whether they chose badly or are simply running out of ceiling, and those
                    call for opposite decisions.
                  */}
                  <span className="gains__room muted">
                    {room !== undefined && room <= 0
                      ? 'at your ceiling'
                      : room !== undefined && room <= 3
                        ? `${room} from your ceiling`
                        : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(outcome.healed?.length || outcome.notes.length > (outcome.injury ? 1 : 0)) && (
        <Card title="Everything else that happened">
          {/*
            Time passing does things other than raise numbers, and none of them used to be
            reported: a fighter came out of a twelve-week camp with a knee that had quietly
            mended and no acknowledgement anywhere that it had.
          */}
          {outcome.healed?.map((line) => (
            <p key={line} className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              <Chip tone="positive">Healed</Chip> {line}
            </p>
          ))}
          {outcome.notes.slice(outcome.injury ? 1 : 0).map((note) => (
            <p key={note} className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
              {note}
            </p>
          ))}
        </Card>
      )}

      {/*
        The way out, and it is the primary action. The old report had none at all — the player
        was left on the training screen with the form they had just submitted, and getting back
        to their career meant finding the nav.
      */}
      <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onDone}>
          Back to your career
        </Button>
        <Button onClick={onAgain}>Run another camp</Button>
      </div>
    </div>
  );
}
