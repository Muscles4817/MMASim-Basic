import { useMemo, useRef, useState } from 'react';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_META,
  BACKGROUNDS,
  BACKGROUND_META,
  BUILDS,
  BUILD_META,
  CREATION_POINTS,
  MAX_POINTS_PER_ATTRIBUTE,
  createPlayerFighter,
  createRng,
  creationSummary,
  divisionsFor,
  validateCreation,
  type AttributeKey,
  type Background,
  type Build,
  type CreateFighterSpec,
  type Gym,
  type Sex,
  findNationality,
  NATIONALITIES,
} from '@mmasim/engine';
import { GROUP_LABELS } from '../game/labels';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Flag, RatingRow, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { clearTransientCareerState } from '../game/career';
import { signFirstDeal } from '../game/contracts';

/**
 * Create your fighter.
 *
 * Deliberately *not* a points budget across fifteen sliders. That invites min-maxing and
 * produces incoherent people — Power 90 on a body with no explosiveness, which the naturals
 * layer says is impossible. Instead you choose a background and a build, which set your
 * hidden physiology and therefore your ceilings, and a small discretionary allocation shapes
 * where you already are inside them.
 *
 * You are choosing what kind of athlete you are, not buying numbers. What you *become* is
 * decided by the next ten years of training.
 */
export function CreateFighterScreen() {
  const { db, updateWorld, commit } = useGame();
  const { navigate } = useRouter();

  const issuesRef = useRef<HTMLDivElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nationality, setNationality] = useState('USA');
  // Whether the typed country is one the game knows, which decides the flag and whether the
  // fighter's generated peers can share a name pool with them.
  const recognised = findNationality(nationality) !== undefined;
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(22);
  const [background, setBackground] = useState<Background>('wrestler');
  const [build, setBuild] = useState<Build>('balanced');
  const [allocation, setAllocation] = useState<Partial<Record<AttributeKey, number>>>({});

  const divisions = useMemo(() => divisionsFor(sex), [sex]);
  const [divisionId, setDivisionId] = useState<string>(divisions[3]?.id as string);

  const spent = Object.values(allocation).reduce((a, v) => a + (v ?? 0), 0);
  const remaining = CREATION_POINTS - spent;

  const spec: CreateFighterSpec = {
    id: `player_${Date.now().toString(36)}`,
    firstName,
    lastName,
    nickname: nickname || undefined,
    nationality,
    sex,
    age,
    divisionId: divisionId as CreateFighterSpec['divisionId'],
    background,
    build,
    allocation,
    day: 0,
  };

  const issues = validateCreation(spec);

  // A stable preview: the same choices always show the same fighter, so the player is
  // comparing decisions rather than rerolling until they like the dice.
  const preview = useMemo(() => {
    if (issues.length > 0) return undefined;
    try {
      return createPlayerFighter(
        { ...spec, id: 'preview' },
        createRng(`preview:${background}:${build}:${age}:${sex}:${divisionId}`),
      );
    } catch {
      return undefined;
    }
    // Deliberately keyed on the *choices* rather than on `spec`, which is rebuilt every
    // render. Serialising the allocation is the cheapest stable key for a small object.
  }, [background, build, age, sex, divisionId, JSON.stringify(allocation), issues.length]);

  /*
   * Keep the fighter roughly where they were when the sex toggle flips.
   *
   * It reset to `divisionsFor(next)[0]` — the lightest class — while the initial state seeds
   * index 3, so toggling Male → Female → Male silently moved the fighter three divisions down
   * from where they started with no notice. Matching by index keeps the weight comparable and
   * makes the toggle reversible, which is what a player expects from a toggle.
   */
  const onSexChange = (next: Sex) => {
    const previous = divisionsFor(sex);
    const index = Math.max(
      0,
      previous.findIndex((d) => (d.id as string) === divisionId),
    );
    setSex(next);
    const options = divisionsFor(next);
    const match = options[Math.min(index, options.length - 1)] ?? options[0];
    if (match) setDivisionId(match.id as string);
  };

  const adjust = (key: AttributeKey, delta: number) => {
    setAllocation((current) => {
      const now = current[key] ?? 0;
      const next = now + delta;
      if (next < 0 || next > MAX_POINTS_PER_ATTRIBUTE) return current;
      /*
       * Budget derived from `current`, not from the render closure.
       *
       * It read `remaining` from the enclosing render, which is stale inside a functional
       * updater: two `+` presses landing in one React batch both saw the same value and the
       * allocation could overshoot the cap. The player then hit "Only 24 points are available"
       * on submit with no indication of which attribute to undo.
       */
      const spentNow = Object.values(current).reduce((a, n) => a + (n ?? 0), 0);
      if (delta > 0 && CREATION_POINTS - spentNow <= 0) return current;
      return { ...current, [key]: next };
    });
  };

  const start = () => {
    const world = db.world.findById('world');
    const day = world?.day ?? 0;

    // Everyone starts at the bottom of the ladder. That is the game.
    const developmental = db.promotions.findAll().find((p) => p.tier === 'developmental');
    // A modest starting gym: you cannot walk into the best room in the world unknown.
    const startingGym = (db.gyms.findAll() as Gym[])
      .slice()
      .sort((a, b) => a.quality - b.quality)[0];

    const fighter = createPlayerFighter(
      { ...spec, day, promotionId: developmental?.id as never, gymId: startingGym?.id },
      createRng(`create:${spec.id}`),
    );

    const withCoach = { ...fighter, headCoachId: startingGym?.headCoachId };
    db.fighters.upsert(withCoach as never);

    // A first deal, at the bottom promotion's floor, take it or leave it. Every fighter
    // starts unsigned and unmanaged — both are real states — but a career needs a first
    // rung, and the bottom of the sport is busy rather than empty.
    signFirstDeal(db, withCoach as never);

    clearTransientCareerState();
    updateWorld({ playerRole: 'fighter', playerFighterId: fighter.id as string });
    commit();
    navigate({ name: 'hub' });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
          Create your fighter
        </h2>
        <p className="muted prose">
          You start unknown, on the smallest show in the sport, below the level everywhere.
          What you become is decided by who trains you and what you drill for the next ten
          years — not by the numbers on this screen.
        </p>
      </Card>

      <Card title="Who you are">
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 10rem' }}>
              <span className="section-title">First name</span>
              <input
                className="field"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label style={{ flex: '1 1 10rem' }}>
              <span className="section-title">Last name</span>
              <input
                className="field"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 12rem' }}>
              <span className="section-title">Nickname (optional)</span>
              <input
                className="field"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="The Predator"
                autoComplete="off"
              />
            </label>
            <label style={{ flex: '1 1 8rem' }}>
              <span className="section-title">Nationality</span>
              {/*
                A real list rather than a free-text box.
               
                It used to be an open input defaulting to "USA", so a typo or an invented country
                was accepted silently and then carried for the rest of the career — and since
                nothing validated it, that fighter would never get a flag and would never match a
                name pool. `datalist` is the right control here: it filters as you type, it is
                keyboard accessible for free, it works properly on a phone keyboard, and it still
                allows a country the list does not carry rather than trapping the player.
              */}
              <input
                className="field"
                list="nationality-options"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                autoComplete="off"
                aria-describedby="nationality-hint"
              />
              <datalist id="nationality-options">
                {NATIONALITIES.map((n) => (
                  <option key={n.code} value={n.name} />
                ))}
              </datalist>
              <span
                id="nationality-hint"
                className="muted"
                style={{
                  fontSize: 'var(--text-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-1)',
                  minHeight: '1.4em',
                }}
              >
                {recognised ? (
                  <Flag nationality={nationality} />
                ) : (
                  'Not a country we know — your fighter will have no flag.'
                )}
              </span>
            </label>
          </div>

          <div>
            <span className="section-title">Sex</span>
            <Segmented
              label="Sex"
              value={sex}
              onChange={onSexChange}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 12rem' }}>
              <span className="section-title">Division</span>
              <select
                className="field"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id as string}>
                    {d.name} ({d.limitLbs} lb)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 8rem' }}>
              <span className="section-title">Debut age: {age}</span>
              <input
                type="range"
                min={18}
                max={35}
                value={age}
                aria-label="Debut age"
                onChange={(e) => setAge(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            Debuting young means more years to grow into your ceiling. Debuting late means you
            start further along and have less runway to use it.
          </p>
        </div>
      </Card>

      <Card title="Where you came from">
        {/*
          A radiogroup, not six toggle buttons.

          `Segmented`'s own comment states the rule for exactly this case: mutually exclusive
          options should announce "selected, 1 of 6" rather than "toggle button, pressed". These
          six were six separate tab stops with no group name, while every other single-select on
          this screen (Sex, Build) uses Segmented. They stay as cards rather than becoming a
          Segmented because each carries a paragraph of description, which is the whole point of
          the choice.
        */}
        <div
          role="radiogroup"
          aria-label="Where you came from"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
            gap: 'var(--space-2)',
          }}
        >
          {BACKGROUNDS.map((key) => {
            const meta = BACKGROUND_META[key];
            const selected = background === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setBackground(key)}
                style={{
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  minHeight: 'var(--tap-target)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <span style={{ fontWeight: 700, display: 'block' }}>{meta.label}</span>
                <span className="muted" style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                  {meta.blurb}
                </span>
                <span
                  className="faint"
                  style={{ fontSize: 'var(--text-xs)', display: 'block', marginTop: 4 }}
                >
                  Weakness: {meta.weakness}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Build">
        <Segmented
          label="Build"
          value={build}
          onChange={setBuild}
          options={BUILDS.map((b) => ({ value: b, label: BUILD_META[b].label }))}
        />
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          {BUILD_META[build].blurb}
        </p>
      </Card>

      <Card
        title="Head start"
        action={
          /*
            Announced. Pressing + changes this and the attribute's value with no other
            feedback, so a screen-reader user got no confirmation that anything happened at
            all — on the screen's only mechanic.
          */
          <Chip tone={remaining === 0 ? 'neutral' : 'accent'}>
            <span role="status">
              {remaining} of {CREATION_POINTS} left
            </span>
          </Chip>
        }
      >
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          A small head start, up to {MAX_POINTS_PER_ATTRIBUTE} in any one area. Enough to say
          what kind of fighter you are — not enough to build a finished one.
        </p>

        {ATTRIBUTE_GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 'var(--space-3)' }}>
            {/*
              `GROUP_LABELS`, not the raw enum. `.section-title` uppercases, which happened to
              disguise "physical" / "striking" for sighted players — but the accessible name
              was still the lowercase enum, and `labels.ts` exists specifically to stop this.
            */}
            <h3 className="section-title">{GROUP_LABELS[group]}</h3>
            {ATTRIBUTES_BY_GROUP[group].map((key) => (
              <div
                key={key}
                className="row"
                style={{ justifyContent: 'space-between', minHeight: 'var(--tap-target)' }}
              >
                {/*
                  The blurb on the page, not in a `title`.

                  The player is asked to spend 24 points across Composure, Scrambling and
                  Fight IQ, and what any of them mean existed only in a tooltip — which shows
                  nothing on touch and cannot be focused by a keyboard. `RatingRow` already
                  renders exactly this hint visibly on the fighter profile.
                */}
                <span style={{ flex: 1, minWidth: 0, paddingRight: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                    {ATTRIBUTE_META[key].label}
                  </span>
                  <span className="rating__hint">{ATTRIBUTE_META[key].blurb}</span>
                </span>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button
                    size="sm"
                    onClick={() => adjust(key, -1)}
                    aria-disabled={(allocation[key] ?? 0) === 0}
                    aria-label={`Remove a point from ${ATTRIBUTE_META[key].label}`}
                  >
                    −
                  </Button>
                  <span
                    className="numeric"
                    style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 700 }}
                  >
                    {allocation[key] ?? 0}
                  </span>
                  {/*
                    `aria-disabled`, matching the primary button at the bottom of this screen
                    and its comment. Real `disabled` dropped all fifteen + buttons out of the
                    tab order the instant the last point was spent, with no message — the same
                    dead end that comment rejects, applied inconsistently fifty lines up.
                  */}
                  <Button
                    size="sm"
                    onClick={() => adjust(key, 1)}
                    aria-disabled={
                      remaining <= 0 || (allocation[key] ?? 0) >= MAX_POINTS_PER_ATTRIBUTE
                    }
                    aria-label={`Add a point to ${ATTRIBUTE_META[key].label}`}
                  >
                    +
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </Card>

      {preview && (
        <Card title="What you would start as">
          <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
            {creationSummary(preview)}
          </p>
          {ATTRIBUTE_GROUPS.map((group) => (
            <div key={group} style={{ marginBottom: 'var(--space-2)' }}>
              {ATTRIBUTES_BY_GROUP[group].map((key) => (
                <RatingRow
                  key={key}
                  label={ATTRIBUTE_META[key].label}
                  value={preview.attributes[key]}
                  ceiling={preview.potential[key]}
                />
              ))}
            </div>
          ))}
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            The tick on each bar is your coach&rsquo;s estimate of your ceiling. He is not always
            right, and your real physiology is rolled — two fighters built identically here are
            not the same person.
          </p>
        </Card>
      )}

      {/*
        `warn`, not `danger`, so this is a polite live region rather than an assertive one.

        The screen opens with "First name is required" already showing, and `Alert tone="danger"`
        maps to `role="alert"` — so every character typed into the name fields mutated an
        assertive region and interrupted the user mid-word. Validation that resolves as you type
        wants polite; the assertive announcement belongs on the submit attempt below, which
        already focuses this block.
      */}
      {issues.length > 0 && (
        <div ref={issuesRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert tone="warn" title="Not ready to turn pro yet">
            <ul style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {/*
        Deliberately not `disabled`.

        A truly disabled button is not focusable, so a keyboard user tabs straight past the
        one control on the screen and never learns why nothing happened — and on touch, a
        greyed button that silently swallows a tap is the same dead end. aria-disabled says
        the same thing to assistive tech while leaving the control reachable, so pressing it
        can explain itself by sending the reader to the reasons.
      */}
      <Button
        variant="primary"
        block
        onClick={() => {
          if (issues.length > 0) {
            issuesRef.current?.focus();
            issuesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
          }
          start();
        }}
        aria-disabled={issues.length > 0}
      >
        Turn pro
      </Button>
    </div>
  );
}
