/**
 * Who this is, before what they are rated.
 *
 * The audit's fighter page had a name, a division, an age and a flag, and nothing else that made
 * anybody a person: no origin line, no gym, no coach, no body. `fighter.background` was set for
 * every generated fighter and shown nowhere; height and reach were on the record and only ever
 * reached the tale of the tape on fight night. This is the strip that puts them in the header,
 * where who somebody is belongs.
 *
 * Everything on it is read or derived — the local room, the hometown and the silhouette are all
 * functions of the fighter's id and the facts already stored — so it costs a save nothing.
 */

import {
  describeBackground,
  hashSeed,
  hometownOf,
  walkingWeightOf,
  type Fighter,
} from '@mmasim/engine';
import type { GameDb } from '@mmasim/data';
import { Flag } from '../ui';
import { trainingRoomOf } from '../game/progression';

const feetAndInches = (n: number): string => `${Math.floor(n / 12)}′${Math.round(n % 12)}″`;

export function IdentityStrip({ db, fighter }: { db: GameDb; fighter: Fighter }) {
  const hometown = hometownOf(fighter);
  const room = trainingRoomOf(db, fighter);
  const coach = room.coach ? `${room.coach.firstName} ${room.coach.lastName}` : undefined;

  return (
    <div className="fighter-identity" data-testid="identity-strip">
      <Silhouette fighter={fighter} />
      <dl className="fighter-identity__facts">
        <div className="fighter-identity__fact fighter-identity__fact--wide">
          <dt>From</dt>
          <dd>
            {hometown ? `${hometown}, ` : ''}
            <Flag nationality={fighter.nationality} />
          </dd>
        </div>
        {fighter.background && (
          <div className="fighter-identity__fact fighter-identity__fact--wide">
            <dt>Came up in</dt>
            <dd>{describeBackground(fighter.background, fighter.sex)}</dd>
          </div>
        )}
        <div className="fighter-identity__fact fighter-identity__fact--wide">
          <dt>Trains at</dt>
          <dd>
            {room.gym
              ? `${room.gym.name}${room.gym.city ? `, ${room.gym.city}` : ''}`
              : 'No gym on record'}
            {coach && <span className="fighter-identity__sub">Head coach {coach}</span>}
          </dd>
        </div>
        <div className="fighter-identity__fact">
          <dt>Height</dt>
          <dd>{feetAndInches(fighter.heightInches)}</dd>
        </div>
        <div className="fighter-identity__fact">
          <dt>Reach</dt>
          <dd>{Math.round(fighter.reachInches)}″</dd>
        </div>
        <div className="fighter-identity__fact">
          <dt>Walks around</dt>
          <dd>{walkingWeightOf(fighter)} lb</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * A head-and-shoulders outline, drawn from the fighter rather than from a picture.
 *
 * Deliberately a silhouette: no faces, no skin tones, nothing that could be read as a claim about
 * what a real or generated person looks like. What varies is what the model knows — the frame and
 * muscle on the stored physique set the shoulders and the neck — and a hairline picked from the id,
 * so the same fighter always looks the same and two fighters on a list look like two people.
 * Coloured from the theme tokens, so it follows light and dark with everything else.
 */
export function Silhouette({ fighter }: { fighter: Fighter }) {
  const seed = hashSeed(`avatar:${fighter.id as string}`);
  const { frameIndex, muscleIndex } = fighter.physique;
  const shoulders = Math.min(
    56,
    Math.max(34, 44 + (muscleIndex - 50) * 0.22 + (frameIndex - 50) * 0.14),
  );
  const neck = Math.min(16, Math.max(8, 11 + (muscleIndex - 50) * 0.08));
  const hair = fighter.sex === 'female' ? 3 + (seed % 3) : seed % 5;
  const beard = fighter.sex === 'male' && (seed >>> 4) % 3 === 0;

  return (
    <svg className="silhouette" viewBox="0 0 64 64" role="img" aria-label="Fighter silhouette">
      <circle className="silhouette__ground" cx="32" cy="32" r="32" />
      <ellipse className="silhouette__body" cx="32" cy="66" rx={shoulders / 2} ry="20" />
      <rect className="silhouette__body" x={32 - neck / 2} y="34" width={neck} height="14" rx="3" />
      <ellipse className="silhouette__body" cx="32" cy="27" rx="10" ry="12" />
      {hair === 1 && (
        <path
          className="silhouette__hair"
          d="M22 25 Q22 13 32 13 Q42 13 42 25 Q37 18 32 18 Q27 18 22 25Z"
        />
      )}
      {hair === 2 && (
        <rect className="silhouette__hair" x="29.5" y="13" width="5" height="12" rx="2.5" />
      )}
      {hair === 3 && (
        <path
          className="silhouette__hair"
          d="M21 30 Q20 13 32 13 Q44 13 43 30 L41 40 Q41 22 32 20 Q23 22 23 40Z"
        />
      )}
      {hair === 4 && <circle className="silhouette__hair" cx="32" cy="13" r="5" />}
      {hair === 5 && (
        <path
          className="silhouette__hair"
          d="M22 26 Q21 13 32 13 Q43 13 42 26 Q40 17 32 17 Q24 17 22 26Z"
        />
      )}
      {beard && (
        <path
          className="silhouette__hair"
          d="M23 30 Q24 41 32 41 Q40 41 41 30 Q38 36 32 36 Q26 36 23 30Z"
        />
      )}
    </svg>
  );
}
