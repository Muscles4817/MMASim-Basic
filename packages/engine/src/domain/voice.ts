/**
 * What fighters say. Doc 34 C3.
 *
 * Until now nobody in the sport said anything. A refusal arrived as a probability, a want as a
 * label, a win as a line in the results — and the personality model underneath had eight axes and
 * twenty traits that decided all of it without one of them ever being heard. This is the layer
 * that lets them talk: short, templated lines keyed on who the fighter is (`toneOf`) and what has
 * just happened (the situation), so a brash champion and a quiet journeyman say different things
 * about the same night.
 *
 * Deterministic and pure. A line is picked from its pool by a hash of the speaker and the moment,
 * so the same event always reads the same way — a re-render must not change what somebody said —
 * and `previous` lets a feed guarantee no two consecutive items carry the same sentence.
 */

import { hashSeed } from '../core/rng.js';
import type { GameDay } from '../core/clock.js';
import { getDivision } from './divisions.js';
import { isKoMethod, type Fighter, type FinishMethod } from './fighter.js';
import type { FighterWant } from './disposition.js';

// --- Who is talking --------------------------------------------------------------------------

/**
 * The register a fighter speaks in, from the axes and the traits.
 *
 * Five rather than eight, because a voice is what an audience hears and an audience hears
 * attitude, not a personality vector: the swagger, the coldness, the respect, the hunger, or
 * nothing in particular.
 */
export type Tone = 'brash' | 'cold' | 'respectful' | 'hungry' | 'plain';

type Speaker = Pick<Fighter, 'id' | 'firstName' | 'lastName' | 'personality' | 'traits'>;

export function toneOf(fighter: Pick<Fighter, 'personality' | 'traits'>): Tone {
  const p = fighter.personality;
  if (fighter.traits.includes('trashTalker') || (p.ego >= 68 && p.charisma >= 50)) return 'brash';
  if (p.charisma < 35) return 'cold';
  if (p.ego < 40 && p.professionalism >= 55) return 'respectful';
  if (p.ambition >= 70) return 'hungry';
  return 'plain';
}

export interface VoiceLine {
  /** Already quoted and attributed: `Kowalski: "…"`. */
  text: string;
  /** Just the words, for screens that set the attribution themselves. */
  quote: string;
  speakerId: Fighter['id'];
  tone: Tone;
}

/**
 * Pick from a pool, deterministically, never repeating `previous`.
 *
 * `previous` is the quote shown last in whatever list this lands in — the feed, the inbox, a
 * recap. Stepping to the neighbour rather than re-hashing keeps the choice stable for everything
 * else.
 */
function pick(pool: readonly string[], key: string, previous?: string): string {
  const at = hashSeed(key) % pool.length;
  const first = pool[at]!;
  return first === previous && pool.length > 1 ? pool[(at + 1) % pool.length]! : first;
}

const fill = (template: string, slots: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? '');

function line(
  speaker: Speaker,
  pools: Readonly<Record<Tone, readonly string[]>>,
  key: string,
  slots: Readonly<Record<string, string>>,
  previous?: string,
): VoiceLine {
  const tone = toneOf(speaker);
  // `previous` is compared after filling, so it is the sentence the reader actually saw.
  const filled = pools[tone].map((t) => fill(t, slots));
  const quote = pick(filled, `${speaker.id as string}:${key}`, previous);
  return { text: `${speaker.lastName}: “${quote}”`, quote, speakerId: speaker.id, tone };
}

// --- Callouts --------------------------------------------------------------------------------

const CALLOUT: Readonly<Record<Tone, readonly string[]>> = {
  brash: [
    '{target}, you have been hiding long enough. Sign the contract.',
    'That was a warm-up. {target}, you are next and you know it.',
    'Everybody saw that. {target} saw it too, and {target} is scared.',
    'Put {target} in front of me and I do that again, only faster.',
  ],
  cold: [
    '{target}. Whenever they want.',
    'Next is {target}. Nothing else to say.',
    'I want {target}. That is all.',
  ],
  respectful: [
    'Respect to {loser}. If the promotion wants it, I would like {target} next.',
    'Tough night. I think I have earned a shot at {target}, but that is not my call.',
    'Thank you to {loser} for taking it. {target} is the fight that makes sense.',
  ],
  hungry: [
    'I did not come here to win a fight. I came for {target}, and then the belt.',
    'One step closer. {target} next — let me prove it.',
    'Give me {target}. I will fight them anywhere.',
  ],
  plain: [
    'Good win. I would like {target} next if they will have it.',
    '{target} makes sense. Let us do it.',
    'Back to the gym, then {target}.',
  ],
};

const CALLOUT_NO_TARGET: Readonly<Record<Tone, readonly string[]>> = {
  brash: [
    'Who is next? Line them up. Nobody in this {division} division can stay with me.',
    'Tell the promotion to find me somebody who can actually fight.',
  ],
  cold: ['Job done. Whoever is next.', 'Nothing to say. Book the next one.'],
  respectful: [
    'Respect to {loser}. I will fight whoever the promotion puts in front of me.',
    'Thank you to everybody who came. Whoever is next, I will be ready.',
  ],
  hungry: [
    'I want the ranked guys now. No more of this — give me a real test.',
    'I am coming for the top of the {division} division. Everybody up there should know it.',
  ],
  plain: ['Happy with that. Back to work.', 'I will take whatever is next.'],
};

const FINISH_CALLOUT_LEAD: Readonly<Record<Tone, readonly string[]>> = {
  brash: ['Lights out. ', 'Told you. ', ''],
  cold: [''],
  respectful: ['', 'Glad it went to plan. '],
  hungry: ['That is what I do. ', ''],
  plain: [''],
};

/**
 * What a winner says from the cage, aimed at somebody when there is somebody to aim at.
 *
 * `targets` are the people a callout would make sense against, best first — the champion, the
 * fighters ranked just above, a rival — and the first one who is not tonight's opponent is named.
 * Without targets the line is aimed at the division instead. Undefined for a draw or a no contest,
 * which nobody calls anybody out after.
 *
 * Written for the post-fight recap (doc 34 A3) as much as for the news feed.
 */
export function calloutFor(input: {
  winner: Speaker & Pick<Fighter, 'divisionId'>;
  loser: Pick<Fighter, 'id' | 'firstName' | 'lastName'>;
  method: FinishMethod;
  day: GameDay;
  targets?: readonly Pick<Fighter, 'id' | 'firstName' | 'lastName'>[];
  /** The quote shown immediately before this one, which this will not repeat. */
  previous?: string;
}): (VoiceLine & { targetId?: Fighter['id'] }) | undefined {
  const { winner, loser, method, day, targets = [], previous } = input;
  if (method === 'draw' || method === 'noContest') return undefined;

  const target = targets.find((t) => t.id !== loser.id && t.id !== winner.id);
  const slots = {
    target: target ? `${target.firstName} ${target.lastName}` : '',
    loser: `${loser.firstName} ${loser.lastName}`,
    division: getDivision(winner.divisionId).name.toLowerCase(),
  };
  const key = `callout:${day}:${loser.id as string}`;
  const base = line(winner, target ? CALLOUT : CALLOUT_NO_TARGET, key, slots, previous);

  // A finish earns a lead-in, picked on its own key so it varies independently of the body.
  const finished = isKoMethod(method) || method === 'submission';
  const lead = finished ? pick(FINISH_CALLOUT_LEAD[base.tone], `${key}:lead`) : '';
  const quote = `${lead}${base.quote}`;
  return {
    ...base,
    quote,
    text: `${winner.lastName}: “${quote}”`,
    targetId: target?.id,
  };
}

// --- Demands, refusals, grievances -----------------------------------------------------------

/** The situations a fighter speaks up in, outside the cage. */
export type VoiceSituation =
  | 'wantsTitleShot'
  | 'wantsMoney'
  | 'wantsActivity'
  | 'wantsRematch'
  | 'wantsLegacy'
  | 'refusesStepUp'
  | 'refusesShortNotice'
  | 'refusesPay'
  | 'refusesGrudge'
  | 'cardCancelled'
  | 'titleSkipped'
  // Doc 34 C6: career events.
  | 'opponentMissedWeight'
  | 'consideringRetirement'
  | 'farewellFight'
  | 'comeback'
  | 'wantsMoveUp'
  | 'rivalry'
  // Fight week's press conference, as the promoter chose to play it. Doc 34 A5.
  | 'pressCivil'
  | 'pressTrashTalk'
  | 'pressConfrontation';

const SAYS: Readonly<Record<VoiceSituation, Readonly<Record<Tone, readonly string[]>>>> = {
  wantsTitleShot: {
    brash: [
      'I am the real champion and everybody knows it. Give me the belt fight.',
      'Stop wasting my time. Title shot, now.',
    ],
    cold: ['I have done enough. Title shot.', 'Next fight is for the belt.'],
    respectful: [
      'I think I have earned a title shot. I hope the promotion agrees.',
      'If the belt is available, I would be honoured.',
    ],
    hungry: [
      'I have not come this far to wait. Put me in with the champion.',
      'Every fight has been for this. Give me the belt fight.',
    ],
    plain: ['I want the title shot next.', 'Feels like it is time for the belt.'],
  },
  wantsMoney: {
    brash: ['I sell the tickets. Pay me like it.', 'Look at the numbers. Then look at my cheque.'],
    cold: ['The money is wrong. Fix it.', 'Pay me properly or I stay home.'],
    respectful: [
      'I would like the deal to reflect where I am now. I think that is fair.',
      'I am grateful, but the terms do not match the fighter any more.',
    ],
    hungry: [
      'I am getting better every fight. The deal is not.',
      'I am worth more than this and I am going to prove it.',
    ],
    plain: ['The deal needs looking at.', 'I think I am underpaid.'],
  },
  wantsActivity: {
    brash: [
      'You are scared to book me. Everybody is.',
      'I am sat at home while you book bums. Give me a date.',
    ],
    cold: ['I want a fight. Any fight.', 'Too long. Book me.'],
    respectful: [
      'I would really like to stay active. Any date works for me.',
      'I am ready whenever the promotion is.',
    ],
    hungry: [
      'Every week off is a week wasted. Give me a date.',
      'I need to fight. Put me on the next card.',
    ],
    plain: ['I need a fight soon.', 'It has been too long since I fought.'],
  },
  wantsRematch: {
    brash: ['That decision was a robbery. Run it back.', 'Everybody knows I won that. Rematch.'],
    cold: ['Rematch. That is all I want.', 'Unfinished business.'],
    respectful: [
      'It was close. I would like the chance to do it again.',
      'I respect the result, but I want a rematch.',
    ],
    hungry: [
      'I learned from it. Give me the rematch and watch.',
      'That is not how my story goes. Run it back.',
    ],
    plain: ['I want the rematch.', 'I think we should do that again.'],
  },
  wantsLegacy: {
    brash: [
      'One more run and they will be talking about me forever.',
      'I am not done. Give me the big ones.',
    ],
    cold: ['A few more. Then I am done.', 'One last run.'],
    respectful: [
      'I would like to finish this the right way, against the best.',
      'I have a few left in me. I want them to mean something.',
    ],
    hungry: ['I want one more go at the top before I stop.', 'Not finished yet. One more run.'],
    plain: ['I would like one more run at it.', 'A couple more big fights and I will see.'],
  },
  refusesStepUp: {
    brash: [
      'Why would I take that fight for this money? Make it worth it.',
      'Not yet. When I take that fight, it will be on my terms.',
    ],
    cold: ['No.', 'Not that fight. Not now.'],
    respectful: [
      'I do not think I am ready for that one yet. Maybe next year.',
      'I would rather build a bit first, if that is all right.',
    ],
    hungry: [
      'Not for this money and not on this notice. Ask me again properly.',
      'I want it, just not like this.',
    ],
    plain: ['That one is too big a jump right now.', 'Not that fight, sorry.'],
  },
  refusesShortNotice: {
    brash: [
      'I am not taking your scraps two weeks out.',
      'Call me with a real camp and we will talk.',
    ],
    cold: ['Not on that notice.', 'No camp, no fight.'],
    respectful: [
      'I would love to help, but I cannot be ready in time.',
      'I am sorry. Not on that notice.',
    ],
    hungry: [
      'Give me a full camp and I take it. Not like this.',
      'I want it. I just cannot be ready.',
    ],
    plain: ['Not enough time to get ready.', 'Too short notice for me.'],
  },
  refusesPay: {
    brash: ['You want me on that money? Laughable.', 'I do not get out of bed for that.'],
    cold: ['The money is wrong.', 'Not for that.'],
    respectful: [
      'I appreciate the offer, but it does not work for me financially.',
      'The money would need to be closer.',
    ],
    hungry: ['I will fight anyone, just not for nothing.', 'Pay me what I am worth and I take it.'],
    plain: ['The money is not there.', 'Not at that price.'],
  },
  refusesGrudge: {
    brash: [
      'After how you lot have treated me? Find somebody else.',
      'You remember what you did. I do too.',
    ],
    cold: ['Not for this promotion. Not right now.', 'I have not forgotten.'],
    respectful: [
      'I think I need some time before I fight for you again.',
      'It is nothing personal, but I am not ready to say yes.',
    ],
    hungry: [
      'I want fights, but not from people who have messed me about.',
      'Show me you are serious about me first.',
    ],
    plain: ['I am still not happy with how I was treated.', 'Not after last time.'],
  },
  cardCancelled: {
    brash: [
      'I cut weight and camped for a show that never happened. Unbelievable.',
      'Amateur hour. I want paying for that camp.',
    ],
    cold: ['Eight weeks for nothing.', 'They cancelled. I will remember it.'],
    respectful: [
      'Disappointing, but these things happen. I hope the next one goes ahead.',
      'Gutted for everybody who bought a ticket.',
    ],
    hungry: [
      'I was ready. Get me back on a card, quickly.',
      'Whole camp, no fight. I need a new date.',
    ],
    plain: ['Frustrating. A whole camp gone.', 'Not happy about the cancellation.'],
  },
  titleSkipped: {
    brash: [
      'They gave my title shot away. Scared of what I would do to the champion.',
      'I am number one and they booked somebody else. Joke.',
    ],
    cold: ['I was next. They did not care.', 'Skipped. Noted.'],
    respectful: [
      'I thought I was next, but it is the promotion’s decision.',
      'Disappointed. I will keep winning until they cannot ignore me.',
    ],
    hungry: [
      'Skip me again and I will win my way past all of them.',
      'That was my shot. I want it back.',
    ],
    plain: ['I thought the shot was mine.', 'Not happy to be passed over.'],
  },
  opponentMissedWeight: {
    brash: [
      'I made weight. They could not even manage that. Unprofessional.',
      'Missed weight? I will make them pay for every pound of it.',
    ],
    cold: ['I did my job. They did not.', 'They missed. That is on them.'],
    respectful: [
      'Disappointing. I did everything right this camp and I expected the same back.',
      'It happens, but it should not happen at this level.',
    ],
    hungry: [
      'I do not care what they weigh. Let me fight.',
      'Heavier or not, I am not going home without a fight.',
    ],
    plain: ['I made weight. They did not.', 'Not happy about the miss.'],
  },
  consideringRetirement: {
    brash: [
      'I have nothing left to prove to anybody. Maybe it is time.',
      'Everybody wants to see me go one more time. I will think about it.',
    ],
    cold: ['I am thinking about stopping.', 'Not sure I want to do this much longer.'],
    respectful: [
      'I am taking some time to think about what comes next. I owe my family that.',
      'This sport has given me a lot. I need to decide whether I have more to give it.',
    ],
    hungry: [
      'Part of me wants to stop. Part of me still wants that last big night.',
      'If I go again, it has to be for something that matters.',
    ],
    plain: ['I am thinking about retiring.', 'Not sure how many fights I have left.'],
  },
  farewellFight: {
    brash: [
      'One more. Give me a big name and a big crowd and I will go out on top.',
      'I want a send-off. Main event. Nothing less.',
    ],
    cold: ['One more fight. Then I am done.', 'Last one. Make it count.'],
    respectful: [
      'I would like one last fight, in front of the fans who have supported me.',
      'If the promotion will have me, I would love a farewell fight.',
    ],
    hungry: [
      'I want to finish on my terms. One more night.',
      'Give me one last fight and I will empty the tank.',
    ],
    plain: ['I want one last fight.', 'One more and I will call it a day.'],
  },
  comeback: {
    brash: [
      'Did you miss me? I am back, and the division is not ready.',
      'Retirement was boring. Time to remind everybody who I am.',
    ],
    cold: ['I am coming back.', 'Unfinished business.'],
    respectful: [
      'I have missed it more than I expected. I would like to compete again.',
      'I feel healthy and hungry. I want to give it another go.',
    ],
    hungry: ['I cannot sit at home watching. Get me a fight.', 'I am back. I want to fight soon.'],
    plain: ['I want to fight again.', 'Thinking about a comeback.'],
  },
  wantsMoveUp: {
    brash: [
      'I am killing myself to make this weight. Let me go up and run that division too.',
      'This cut is beneath me. Book me a weight up.',
    ],
    cold: ['The cut is too much. I want to move up.', 'I am done making this weight.'],
    respectful: [
      'I think my body is telling me it is time to move up a division.',
      'The weight cut is getting harder. I would like to try the next class up.',
    ],
    hungry: [
      'Let me fight at a weight where I can actually perform.',
      'Move me up and you will see the real me.',
    ],
    plain: ['I want to move up a weight.', 'The cut is too hard now.'],
  },
  rivalry: {
    brash: [
      'We are not done. I will settle this for good.',
      'Everybody knows I won that. Run it back and I will prove it.',
    ],
    cold: ['This is not finished.', 'That one again. Good.'],
    respectful: [
      'We have a lot of history. I would like to settle it properly.',
      'They are a great competitor, and I think the fans want to see it again.',
    ],
    hungry: [
      'I want that fight again. As soon as possible.',
      'There is only one fight I care about right now.',
    ],
    plain: ['I want the rematch.', 'We have unfinished business.'],
  },
  pressCivil: {
    brash: [
      'I will be polite today. On the night I will not be.',
      'Nice and calm up here. It will not be calm in there.',
    ],
    cold: ['Good camp. See you on the night.', 'Nothing to say. I am ready.'],
    respectful: [
      'Big respect to my opponent. It will be a great fight for everybody watching.',
      'Thank you to the promotion and to everybody here. We are both ready.',
    ],
    hungry: [
      'This is the fight I wanted. I am taking the next step on fight night.',
      'Camp went perfectly. Watch what I do with this chance.',
    ],
    plain: ['Camp went well. Looking forward to it.', 'Ready to go. Should be a good one.'],
  },
  pressTrashTalk: {
    brash: [
      'Look at him. He knows. Everybody in this room knows.',
      'I have sparred people better than this every week of camp.',
    ],
    cold: ['He talks a lot for somebody about to lose.', 'Words will not help him on the night.'],
    respectful: [
      'I do not need to say anything. I will let the fight answer him.',
      'He can say what he likes. I respect the sport too much for that.',
    ],
    hungry: [
      'He has been ducking people for years. Not this time.',
      'Everything he has said is going in the tank for fight night.',
    ],
    plain: ['He is overrated and I will show it.', 'He has said enough. Fight night, then.'],
  },
  pressConfrontation: {
    brash: [
      'Get him out of my face before I finish it right here.',
      'Touch me again and we do not need to wait for fight night.',
    ],
    cold: ['Push me again.', 'He will regret that.'],
    respectful: [
      'That was not professional, and I will not be drawn into it.',
      'Keep it for the cage. That is where this gets settled.',
    ],
    hungry: [
      'I am not backing down from anybody, not up here and not in there.',
      'He wanted a reaction. He has got one.',
    ],
    plain: ['That got out of hand.', 'Save it for the fight.'],
  },
};

/**
 * What a fighter says in a situation, in their own register.
 *
 * Used for wants on the fighter page, refusals in the inbox, and grievances in the news. `when`
 * fixes the choice to a moment — the same refusal on the same day reads the same — and `previous`
 * stops a list from saying one sentence twice in a row.
 */
export function voiceFor(
  speaker: Speaker,
  situation: VoiceSituation,
  when: GameDay,
  previous?: string,
): VoiceLine {
  return line(speaker, SAYS[situation], `${situation}:${when}`, {}, previous);
}

/** The situation a want is voiced as, when it has one. */
export function wantVoice(id: FighterWant): VoiceSituation | undefined {
  switch (id) {
    case 'titleShot':
    case 'worthyChallenger':
    case 'superfight':
      return 'wantsTitleShot';
    case 'rematch':
      return 'wantsRematch';
    case 'moneyFight':
      return 'wantsMoney';
    case 'oneLastRun':
      return 'wantsLegacy';
    case 'anyWin':
      return 'refusesStepUp';
    case 'activity':
      return 'wantsActivity';
    case 'money':
      return 'wantsMoney';
    case 'moveUp':
      return 'wantsMoveUp';
    case 'farewell':
      return 'farewellFight';
    default:
      return undefined;
  }
}

/** Every pool, for tests that check the register and the length of what is said. */
export const VOICE_POOLS = { CALLOUT, CALLOUT_NO_TARGET, SAYS } as const;
