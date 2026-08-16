import { useMemo, useState } from 'react';
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
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, RatingRow, Segmented } from '../ui';
import { clearTransientCareerState } from '../game/career';

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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nationality, setNationality] = useState('USA');
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

  const onSexChange = (next: Sex) => {
    setSex(next);
    const first = divisionsFor(next)[0];
    if (first) setDivisionId(first.id as string);
  };

  const adjust = (key: AttributeKey, delta: number) => {
    setAllocation((current) => {
      const now = current[key] ?? 0;
      const next = now + delta;
      if (next < 0 || next > MAX_POINTS_PER_ATTRIBUTE) return current;
      if (delta > 0 && remaining <= 0) return current;
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
              <input
                className="field"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                autoComplete="off"
              />
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
        <div
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
                aria-pressed={selected}
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
          <Chip tone={remaining === 0 ? 'neutral' : 'accent'}>
            {remaining} of {CREATION_POINTS} left
          </Chip>
        }
      >
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          A small head start, up to {MAX_POINTS_PER_ATTRIBUTE} in any one area. Enough to say
          what kind of fighter you are — not enough to build a finished one.
        </p>

        {ATTRIBUTE_GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 'var(--space-3)' }}>
            <h3 className="section-title">{group}</h3>
            {ATTRIBUTES_BY_GROUP[group].map((key) => (
              <div
                key={key}
                className="row"
                style={{ justifyContent: 'space-between', minHeight: '2.5rem' }}
              >
                <span style={{ fontSize: 'var(--text-sm)' }} title={ATTRIBUTE_META[key].blurb}>
                  {ATTRIBUTE_META[key].label}
                </span>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button
                    size="sm"
                    onClick={() => adjust(key, -1)}
                    disabled={(allocation[key] ?? 0) === 0}
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
                  <Button
                    size="sm"
                    onClick={() => adjust(key, 1)}
                    disabled={remaining <= 0 || (allocation[key] ?? 0) >= MAX_POINTS_PER_ATTRIBUTE}
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

      {issues.length > 0 && (
        <Card>
          <ul className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {issues.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Button variant="primary" block onClick={start} disabled={issues.length > 0}>
        Turn pro
      </Button>
    </div>
  );
}
