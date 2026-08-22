/**
 * The men's calibration roster.
 *
 * Doc 31 § 12 step 5. Every physical is a **sigma placement against the division's major-promotion
 * median**, never a typed rating — see `entry.ts` for why the two claims are kept apart.
 *
 * ---
 *
 * ## How these were placed
 *
 * Each of the five was assessed **on its own**. That is the discipline this file exists to keep, and
 * it is the easy thing to get wrong: "he is an explosive athlete" invites Power +2, Speed +2 and
 * Strength +2 together, which is exactly the correlated-archetype problem the whole redesign is
 * trying to escape. Somebody can be extremely powerful and only moderately quick, very fast without
 * being strong, or superbly conditioned without being either.
 *
 * Where the evidence for an attribute is thin, the placement sits **near the divisional centre**
 * rather than being filled in from reputation. A roster of memorable outliers would misrepresent the
 * UFC population as badly as one with no outliers at all, so roughly a third of these entries are
 * deliberately ordinary.
 *
 * ## What is measured and what is guessed
 *
 * `measured` heights and reaches are the sport's official figures. `estimated.walkingWeightLbs` is
 * **inference in every single case** — nobody publishes it — and carries a confidence tag saying how
 * much reporting there was behind the guess. Body fat and water-cut capacity are inferences about
 * inferences and should be read as shape rather than as measurement.
 *
 * ## What was deliberately not consulted
 *
 * The existing seed rosters' Power, Speed, Cardio, Durability and Strength ratings. Those predate
 * this ladder and are not calibration evidence; doc 31 § 0's second rule forbids laundering the old
 * scale into the new one through the back door. Career facts — who fought where, who was stopped,
 * who missed weight — are fair game and are what the notes lean on.
 */

import type { CalibrationEntry } from './entry.js';

const HW = 'mens-heavyweight';
const LHW = 'mens-light-heavyweight';
const MW = 'mens-middleweight';
const WW = 'mens-welterweight';
const LW = 'mens-lightweight';
const FW = 'mens-featherweight';
const BW = 'mens-bantamweight';
const FLW = 'mens-flyweight';

export const MEN_CALIBRATION: readonly CalibrationEntry[] = [
  // --- Heavyweight -------------------------------------------------------------------------
  {
    id: 'cal_ngannou',
    name: 'Francis Ngannou',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 83 },
    estimated: { walkingWeightLbs: 260, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 40 },
    placement: { power: 2.4, speed: 1.2, cardio: -1.5, durability: 0.2, strength: 2.2 },
    defence: {
      power:
        'Force, not finishing. He has broken hand-held pads and knocked men out with glancing shots that did not land clean, which is the distinction that matters: the reel would look similar for an accurate puncher, but the equipment damage and the way opponents move after partial contact are evidence about impulse rather than about placement.',
      strength:
        'Clinch and grappling force against heavyweights, not wrestling skill. He is repeatedly out-grappled by better technicians who nonetheless cannot hold him where they put him, which separates the two cleanly.',
    },
    notes:
      'The top-of-scale Power anchor, and placed at +2.4 rather than higher on purpose: +2.6 resolves past 100 and clips, which would make the scale unable to distinguish him from somebody who hits harder still. Speed +1.2 is a real athlete for 260 lb and nothing like an elite lightweight — the comparison doc 31 § 5 is built on. Cardio −1.5 is well documented across his five-round fights. Durability +0.2 is deliberately ordinary: he has been dropped and out-grappled, and giving a famous puncher a famous chin to match is the archetype error this file is trying to avoid.',
  },
  {
    id: 'cal_miocic',
    name: 'Stipe Miocic',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 80 },
    estimated: { walkingWeightLbs: 245, confidence: 'fair', bodyFatIndex: 40, waterCutIndex: 45 },
    placement: { power: 0.3, speed: 0.5, cardio: 1.6, durability: 1.3, strength: 0.1 },
    notes:
      'The division-median-ish champion, which is why he is here. Nothing about him is freakish; the Cardio +1.6 and Durability +1.3 are what a long heavyweight title reign is actually made of. Strength +0.1 despite a wrestling base, because wrestling skill is not the same claim as absolute force.',
  },
  {
    id: 'cal_lewis',
    name: 'Derrick Lewis',
    measured: { sex: 'male', division: HW, heightInches: 75, reachInches: 79 },
    estimated: { walkingWeightLbs: 265, confidence: 'fair', bodyFatIndex: 72, waterCutIndex: 35 },
    placement: { power: 2.2, speed: -1.2, cardio: -1.4, durability: 0.6, strength: 0.9 },
    defence: {
      power:
        'Single-shot force from static positions and off his back, where technique contributes least. A fighter who needs setup to hurt people would not produce that pattern.',
    },
    notes:
      'The second Power anchor, and a useful contrast with Ngannou: nearly the same force from a very different body. High body fat is the point — carried mass without contractile mass, which the lean/carried split should read differently. Speed −1.2 and Cardio −1.4 are both well attested, and the Speed placement is not a grudging one: he is close to immobile, throws in single bursts, and is regularly outworked by men his own size. A heavyweight division with no genuine plodder in it has a Speed distribution that starts at its own median.',
  },
  {
    id: 'cal_velasquez',
    name: 'Cain Velasquez',
    measured: { sex: 'male', division: HW, heightInches: 73, reachInches: 77 },
    estimated: { walkingWeightLbs: 250, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 45 },
    placement: { power: 0.3, speed: 0.9, cardio: 2.9, durability: 0.8, strength: 0.8 },
    defence: {
      cardio:
        'Work rate sustained across five rounds at 250 lb, measured by output that does not fall rather than by fights that ended early. His pace was the same in round five as round one against opponents who had stopped throwing, which is capacity rather than pacing discipline.',
    },
    notes:
      "The heavyweight Cardio anchor and half of doc 31 § 5's sharpest comparison: at +2.9σ he is the best engine the division has had, and the ladder should still put him below a very good flyweight in absolute terms. Power +0.3 is deliberately modest — he finished people with volume and pace rather than single shots — and Strength +0.8 comes from wrestling control rather than from size, since at 250 lb he is one of the smaller men in the division. Speed +0.9 is real but a long way short of Aspinall or Gane. Durability +0.8 for a chin that held up under sustained heavyweight fire, with the caveat that his career was ended by joints rather than by concussions.",
    disagreement: {
      kind: 'outsideBodyModelRange',
      note: 'Reconstructs 7 lb light, at the same coefficient ceiling that breaks Mark Hunt: 6 foot 1 at 250 lb and low body fat needs more lean mass per cubic metre of height than the model can express. Much less severe than Hunt and the same defect. His Cardio placement is the one this file most depends on, and Cardio reads total mass rather than lean, so the error moves his rating by a point or two rather than invalidating him — but it is recorded rather than rounded away.',
    },
  },
  {
    id: 'cal_overeem',
    name: 'Alistair Overeem',
    measured: { sex: 'male', division: HW, heightInches: 77, reachInches: 80 },
    estimated: { walkingWeightLbs: 255, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 40 },
    placement: { power: 1.7, speed: 0.2, cardio: -0.4, durability: -0.9, strength: 1.1 },
    notes:
      'A suspect-durability case at the top of the sport, and one of the better documented ones: repeatedly stopped by strikes across the back half of a long career while still hitting extremely hard. Power +1.7 against Durability −0.9 is precisely the profile a correlated model cannot produce. Strength +1.1 from a heavyweight who was visibly the more muscular man in most of his fights, Speed +0.2 for a fighter who was never quick even in his prime, and Cardio −0.4 for one whose later fights were decided by how much he had left after two rounds.',
  },
  {
    id: 'cal_werdum',
    name: 'Fabricio Werdum',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 77 },
    estimated: { walkingWeightLbs: 248, confidence: 'poor', bodyFatIndex: 55, waterCutIndex: 40 },
    placement: { power: -0.4, speed: -0.4, cardio: 0.6, durability: 0.5, strength: 0 },
    notes:
      'The physically ordinary elite technician at heavyweight — a champion whose five physicals are all within half a sigma of his division and whose career was built on submission grappling. Short reach for 6\'4" as well. Power −0.4 and Speed −0.4 are both below his own division, Strength sits exactly at it, and Cardio +0.6 and Durability +0.5 are the mildest of positives — five placements inside 0.6σ on a man who beat the best heavyweight of his era. If this profile cannot win fights in the simulation, the technical half of the model is not carrying its weight.',
  },
  {
    id: 'cal_aspinall',
    name: 'Tom Aspinall',
    measured: { sex: 'male', division: HW, heightInches: 77, reachInches: 78 },
    estimated: { walkingWeightLbs: 255, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 40 },
    placement: { power: 1.1, speed: 2.0, cardio: 0.3, durability: 0.1, strength: 0.4 },
    defence: {
      speed:
        'Limb velocity at heavyweight, visible in hand speed and in getting up from the floor, not in reaction time or timing. He beats people to the punch who are not slow, and he moves the same way when nothing is happening.',
    },
    notes:
      'The heavyweight athletic freak the acceptance criteria ask for, and specifically a *Speed* freak rather than a power one — +2.0σ at 255 lb, which the absolute ladder should still render as merely quick next to a lightweight. Cardio and Durability left near the centre because there is not much five-round evidence either way.',
  },
  {
    id: 'cal_blaydes',
    name: 'Curtis Blaydes',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 80 },
    estimated: { walkingWeightLbs: 265, confidence: 'fair', bodyFatIndex: 45, waterCutIndex: 40 },
    placement: { power: 0.1, speed: 0.4, cardio: 0.9, durability: -0.4, strength: 2.0 },
    defence: {
      strength:
        'Takedown and control force against the largest men in the sport, separable from wrestling skill because he loses position to better grapplers and still cannot be shifted once he has it.',
    },
    notes:
      'The Strength anchor at heavyweight: a wrestler who physically moves the largest men in the sport around. Power only +0.1 — he wins by control, not by hurting people — and Durability −0.4 on a record with several stoppage losses. Strong and not especially powerful is one of the four profiles the archetype problem makes impossible.',
  },
  {
    id: 'cal_hunt',
    name: 'Mark Hunt',
    measured: { sex: 'male', division: HW, heightInches: 70, reachInches: 72 },
    estimated: { walkingWeightLbs: 265, confidence: 'fair', bodyFatIndex: 80, waterCutIndex: 30 },
    placement: { power: 2.0, speed: -1.0, cardio: -1.2, durability: 2.2, strength: 0.5 },
    defence: {
      power:
        'Impulse from a very short, very heavy body, delivered without setup. His knockouts came from single counters thrown flat-footed, which is close to a pure force measurement.',
      durability:
        'Impulse required to concuss, and the evidence is a decade of absorbing clean heavyweight shots and continuing. Explicitly not a defensive rating: he was easy to hit and that is the point, because it means the damage arrived and did nothing. Placed at his prime rather than at the end, when it stopped being true.',
    },
    notes:
      "The short-and-thick anchor: 5'10\" and 265 lb, the most extreme mass-for-height in this file, with the shortest reach in the division. Durability +2.2 is the best documented chin in heavyweight history. Speed −1.0 for a flat-footed fighter who was slow at 265 lb even by the division's standards. Strength only +0.5 despite the mass, because he was a striker rather than a grappler and never showed the clinch force the number is about.",
    disagreement: {
      kind: 'outsideBodyModelRange',
      note: 'The body model cannot build him. Lean mass per cubic metre of height is capped at 15.3 for men and 5 foot 10 at 265 lb needs about 18, so physiqueForMeasurements returns a 226 lb man and every number this entry produces describes that man instead. He is the most extreme mass-for-height in the sport and that is precisely why he is in the file, so the entry stays exactly as transcribed and the model is what has to change. Until the ceiling moves — step 6 owns the mass coefficients — his five placements are not calibration evidence, because they resolve against the divisional median for a 226 lb heavyweight rather than a 265 lb one.',
    },
  },
  {
    id: 'cal_dos_santos',
    name: 'Junior dos Santos',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 77 },
    estimated: { walkingWeightLbs: 250, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 40 },
    placement: { power: 1.5, speed: 1.0, cardio: 0.2, durability: -0.8, strength: -0.1 },
    notes:
      "A second power-with-fragility case, and a useful cross-check on Overeem: stopped by strikes repeatedly in the second half of his career while remaining one of the division's heavier hitters. Strength −0.1 is low for the division and is the honest reading — he was out-wrestled routinely. Speed +1.0 for genuinely quick feet at heavyweight, Cardio +0.2 for a fighter who worked five rounds without ever looking comfortable in them, and Durability −0.8 as the other half of the fragility case.",
  },

  {
    id: 'cal_volkov',
    name: 'Alexander Volkov',
    measured: { sex: 'male', division: HW, heightInches: 79, reachInches: 80 },
    estimated: { walkingWeightLbs: 255, confidence: 'poor', bodyFatIndex: 52, waterCutIndex: 40 },
    placement: { power: 0.2, speed: -0.2, cardio: 0.8, durability: 0.4, strength: -0.6 },
    notes:
      'The tall-and-light-framed heavyweight: six foot seven carrying 255 lb, which is a very long body with unremarkable mass on it. Strength −0.6 is the placement that shows the frame is not the same thing as the mass — he is routinely out-muscled in the clinch by men four inches shorter. Power +0.2 is the more surprising one and is deliberate: he stops people by volume and length, not by force, and the file needs heavyweights who do not punch hard or the top of the Power ladder gets read as the divisional norm. Cardio +0.8 for a fighter who reliably works five rounds at 250 lb.',
  },
  {
    id: 'cal_gane',
    name: 'Ciryl Gane',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 81 },
    estimated: { walkingWeightLbs: 255, confidence: 'fair', bodyFatIndex: 45, waterCutIndex: 45 },
    placement: { power: 0.4, speed: 1.6, cardio: 0.6, durability: -0.3, strength: -0.8 },
    notes:
      'The second heavyweight athletic freak on Speed, and the cleanest demonstration in the division that Speed and Power are separate attributes: he moves like a middleweight at 250 lb and does not hit anything like as hard as the men around him in this file. Strength −0.8 is well evidenced — he has been taken down and held there by wrestlers, repeatedly, and could not get up. Durability −0.3 for a chin that has been found more than once. Power +0.4 rather than higher because his finishes come from accumulation and placement.',
  },
  {
    id: 'cal_arlovski',
    name: 'Andrei Arlovski',
    measured: { sex: 'male', division: HW, heightInches: 76, reachInches: 77 },
    estimated: { walkingWeightLbs: 248, confidence: 'poor', bodyFatIndex: 48, waterCutIndex: 45 },
    placement: { power: 0.8, speed: 0.4, cardio: 0.2, durability: -1.5, strength: -0.2 },
    defence: {
      durability:
        "Defended at −1.5 because it is the entry where career damage is hardest to separate from the underlying threshold. The knockout losses run across many years and many opponents, which is what makes it a fact about him rather than about one night — but the honest reading is that a long career at heavyweight is exactly when the game's damage system should be doing the work, and the placement is deliberately not lower for that reason.",
    },
    notes:
      'The suspect-chin anchor at heavyweight, and the counterweight to Mark Hunt in the same division. Durability −1.5 rests on the right evidence: a long run of knockout losses to strikes that other heavyweights in this file demonstrably absorbed, spread across enough years and opponents to be a fact about him rather than about any one night. Everything else is close to the divisional centre — Power +0.8 is real but ordinary for the class — which is the point, because a fragile heavyweight who is otherwise unremarkable is a shape the generator must be able to produce. Speed +0.4 and Cardio +0.2 are both unremarkable for the class, and Strength −0.2 is the same: he was neither a wrestler nor a man who moved people in the clinch.',
  },
  {
    id: 'cal_tybura',
    name: 'Marcin Tybura',
    measured: { sex: 'male', division: HW, heightInches: 75, reachInches: 78 },
    estimated: { walkingWeightLbs: 248, confidence: 'poor', bodyFatIndex: 55, waterCutIndex: 45 },
    placement: { power: 0.0, speed: 0.0, cardio: 0.4, durability: 0.2, strength: 0.3 },
    notes:
      'Deliberately and completely ordinary — five placements inside 0.4σ, which for heavyweight means a man who hits about as hard as the division does, moves about as well, and lasts about as long. A ranked, long-tenured heavyweight who is exceptional at nothing. Heavyweight in this file is otherwise anchored by the sport’s hardest punchers, and without entries like this one the division’s Power median would be read off a sample of five outliers. Speed 0.0, Cardio +0.4, Durability +0.2 and Strength +0.3 are all within a few tenths of the divisional centre, which is the entire claim being made about him.',
  },
  // --- Light heavyweight --------------------------------------------------------------------
  {
    id: 'cal_jones',
    name: 'Jon Jones',
    measured: { sex: 'male', division: LHW, heightInches: 76, reachInches: 84 },
    estimated: { walkingWeightLbs: 230, confidence: 'good', bodyFatIndex: 35, waterCutIndex: 60 },
    alsoFought: [HW],
    placement: { power: 0.5, speed: 1.9, cardio: 1.2, durability: 1.7, strength: 1.6 },
    defence: {
      speed:
        'Whole-body and limb velocity at 205 lb — the speed he closes distance and changes level at, not his timing or fight IQ, both of which are separately elite and belong to the technical attributes.',
    },
    notes:
      'The longest reach in the file at 84.5" rounded down, and the most valuable cross-division mover: a full career at 205 followed by a move to heavyweight, which is exactly the held-constant human step 7 needs. Power +0.5 is deliberately not higher — his finishes came from elbows, volume and position rather than single-shot force, and giving the best fighter the best of everything is the failure this file guards against. Speed +1.9 for the fastest light heavyweight of his era, Strength +1.6 from a wrestling base that controlled everybody he met, Durability +1.7 for a career never stopped by strikes, and Cardio +1.2 for championship rounds he routinely won.',
  },
  {
    id: 'cal_pereira',
    name: 'Alex Pereira',
    measured: { sex: 'male', division: LHW, heightInches: 76, reachInches: 79 },
    estimated: { walkingWeightLbs: 230, confidence: 'good', bodyFatIndex: 30, waterCutIndex: 55 },
    alsoFought: [MW],
    placement: { power: 2.2, speed: 1.4, cardio: 0.4, durability: 1, strength: 0.9 },
    defence: {
      power:
        'Kickboxing force carried up two divisions, where the same shots kept ending fights against much larger men. Accuracy would not transfer that way; force does.',
    },
    notes:
      'A mover in the other direction — up from middleweight — and the light-heavyweight Power anchor. Cardio +0.4 and Strength +0.9 are both ordinary for the division, which is the point: a one-shot finisher need not be an all-round athlete.',
    disagreement: {
      kind: 'cutModelTooStrict',
      note: 'The model calls a 10.8% cut impossible, which it plainly is not — this is a routine light-heavyweight cut and he made it repeatedly. The mechanism is visible: physiqueForMeasurements splits his stated walking weight into lean and fat at a low body-fat index, camp weight is then lean divided by 0.93, and the weigh-in floor lands above 205 before any water comes off. An unusually lean fighter is being penalised twice for the same leanness, and that is a defect in the composition inference rather than a fact about him.',
      resolution:
        'Resolved by doc 31 section 14.6. The filing was wrong twice over and both errors are worth keeping visible. It blamed the composition inference, and the algebra says the frame/muscle split cannot move the floor at all when height and walking weight are held: lean mass is pinned by the measurements. And the real shortfall was 0.4 lb on a 230 lb man, under two parts in a thousand, which is not a physiological finding about him but a precision the model never had. The fight-week pool is now three named pools rather than one, and he sits at typical with eight pounds of headroom.',
    },
  },
  {
    id: 'cal_cormier',
    name: 'Daniel Cormier',
    measured: { sex: 'male', division: LHW, heightInches: 71, reachInches: 72 },
    estimated: { walkingWeightLbs: 230, confidence: 'good', bodyFatIndex: 70, waterCutIndex: 65 },
    alsoFought: [HW],
    placement: { power: 0.4, speed: 0.6, cardio: 1.4, durability: 1.2, strength: 2.1 },
    defence: {
      strength:
        'Olympic-level clinch and throwing force. The wrestling technique is a skill and is rated elsewhere; this is that he moves people who cannot be moved by wrestlers of comparable technique.',
    },
    notes:
      "Short and thick for light heavyweight, a severe cutter, and a two-division champion — three of the coverage requirements in one entry. Strength +2.1 is an Olympic-level wrestler's clinch force. Power +0.4 is modest and correct: he stopped people by accumulation and position. Speed +0.6 is ordinary and Cardio +1.4 is not, which is the wrestler profile; Durability +1.2 for a chin that only the two best men in the sport ever found.",
  },
  {
    id: 'cal_teixeira',
    name: 'Glover Teixeira',
    measured: { sex: 'male', division: LHW, heightInches: 74, reachInches: 76 },
    estimated: { walkingWeightLbs: 220, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 45 },
    placement: { power: 0.3, speed: -0.4, cardio: 0.5, durability: 0.8, strength: 0.7 },
    notes:
      'An ordinary athlete who held a world title at 42 on craft and durability. Speed −0.4 is the honest reading and the reason the entry is here: the roster needs fighters who are slow for their class and still good. Power +0.3 and Strength +0.7 are both mild positives for a heavy-handed but never overpowering fighter, and Cardio +0.5 is the modest engine of somebody who won late by wearing people down rather than by outlasting them.',
  },
  {
    id: 'cal_blachowicz',
    name: 'Jan Błachowicz',
    measured: { sex: 'male', division: LHW, heightInches: 74, reachInches: 78 },
    estimated: { walkingWeightLbs: 225, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: 1, speed: -0.2, cardio: 0.3, durability: 0.6, strength: 0.5 },
    notes:
      'A division-median athlete with one genuinely above-average attribute. Placed here as an ordinary case rather than a memorable one, which the roster needs more of than it needs freaks. Power +1.0 is the one above-average attribute, and Speed −0.2, Cardio +0.3, Durability +0.6 and Strength +0.5 are all inside two thirds of a sigma of the division median.',
  },
  {
    id: 'cal_anthony_smith',
    name: 'Anthony Smith',
    measured: { sex: 'male', division: LHW, heightInches: 76, reachInches: 76 },
    estimated: { walkingWeightLbs: 218, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 50 },
    placement: { power: 0.4, speed: 0.2, cardio: 0.1, durability: 0.5, strength: -1.1 },
    notes:
      'Tall and light-framed for the division — 6\'4" walking around 218 — with a reach no longer than his height. Strength −1.1 is the coverage case the criteria ask for, and it is well evidenced rather than assigned: he is put on the fence and taken down by light heavyweights as a matter of routine, and at 218 lb walking he is carrying less mass than almost anybody he faces. Physically weak for his class and competitive on skill is a combination the division needs represented. Power +0.4, Speed +0.2, Cardio +0.1 and Durability +0.5 are all close to the divisional centre, so the entry is a single sharp negative on an otherwise median light heavyweight.',
  },
  {
    id: 'cal_hill',
    name: 'Jamahal Hill',
    measured: { sex: 'male', division: LHW, heightInches: 76, reachInches: 79 },
    estimated: { walkingWeightLbs: 220, confidence: 'poor', bodyFatIndex: 35, waterCutIndex: 50 },
    placement: { power: 1.2, speed: 1.3, cardio: 0.2, durability: -0.5, strength: -0.3 },
    notes:
      'Fast and powerful with nothing else above the line — Strength −0.3 and Cardio +0.2 on a tall, light frame. A useful shape: two attributes elevated and three ordinary, which is what most good fighters actually look like.',
  },
  {
    id: 'cal_bader',
    name: 'Ryan Bader',
    measured: { sex: 'male', division: LHW, heightInches: 74, reachInches: 74 },
    estimated: { walkingWeightLbs: 225, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 50 },
    alsoFought: [HW],
    placement: { power: -0.2, speed: 0.3, cardio: 0.4, durability: 0.1, strength: 1.0 },
    notes:
      'The most ordinary entry in the division and deliberately so: five placements inside one sigma, a long career, and a mover to heavyweight for step 7. The roster needs this profile more than it needs another champion. Power −0.2, Speed +0.3, Cardio +0.4 and Durability +0.1 sit at the division median, with Strength +1.0 the only placement that departs from it, on a decorated wrestling base.',
  },
  {
    id: 'cal_thiago_santos',
    name: 'Thiago Santos',
    measured: { sex: 'male', division: LHW, heightInches: 74, reachInches: 76 },
    estimated: { walkingWeightLbs: 225, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 55 },
    alsoFought: [MW],
    placement: { power: 1.8, speed: 0.7, cardio: -0.8, durability: 0, strength: 0.4 },
    defence: {
      power:
        'Force per strike, evidenced by damage done through blocks and by opponents visibly hurt while defending. Not volume and not accuracy, neither of which was ever his strength.',
    },
    notes:
      'Enormous single-shot power with a poor gas tank, which is a common and under-represented combination. Cardio −0.8 is the placement doing work here; without it he would read as a straightforwardly elite athlete, which he was not. Speed +0.7 for a fast striker, Strength +0.4 for a man who was never a grappler, and Durability 0.0 exactly at the division median, because a career of leg damage says nothing about the impulse needed to concuss him.',
  },

  // --- Middleweight ------------------------------------------------------------------------
  {
    id: 'cal_adesanya',
    name: 'Israel Adesanya',
    measured: { sex: 'male', division: MW, heightInches: 76, reachInches: 80 },
    estimated: { walkingWeightLbs: 205, confidence: 'good', bodyFatIndex: 25, waterCutIndex: 50 },
    alsoFought: [LHW],
    placement: { power: 1.4, speed: 1.9, cardio: 0.6, durability: 0.7, strength: -0.4 },
    defence: {
      speed:
        'Hand and foot velocity, distinguishable from his timing because both are elite and they fail independently — he has been out-timed by fighters he was visibly quicker than.',
    },
    notes:
      'Tall and light-framed — 6\'4" competing at 185 — with Strength −0.4, which is a real and well-known thing about him and which doc 31 § 5 uses as a worked example. A mover to light heavyweight, unsuccessfully, which makes him a good mass-law test in the direction the model should punish. Power +1.4 is real but below the divisional anchors, Speed +1.9 is the attribute the whole career was built on, Cardio +0.6 is modest for a five-round champion, and Durability +0.7 for a chin found only twice in a long title reign.',
  },
  {
    id: 'cal_whittaker',
    name: 'Robert Whittaker',
    measured: { sex: 'male', division: MW, heightInches: 72, reachInches: 73 },
    estimated: { walkingWeightLbs: 200, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 55 },
    alsoFought: [WW],
    placement: { power: 0.4, speed: 1.3, cardio: 1.4, durability: 0.8, strength: 0.3 },
    notes:
      'A mover up from welterweight, and a fighter whose game is speed and pace rather than force — Power +0.4 against Speed +1.3. Short reach for the division. Cardio +1.4 for a fighter who never faded in a championship round, Durability +0.8 for a long career with one stoppage in it, and Strength +0.3 for somebody who was neither pushed around nor pushing.',
  },
  {
    id: 'cal_romero',
    name: 'Yoel Romero',
    measured: { sex: 'male', division: MW, heightInches: 72, reachInches: 73 },
    estimated: { walkingWeightLbs: 205, confidence: 'fair', bodyFatIndex: 15, waterCutIndex: 60 },
    placement: { power: 1.9, speed: 1.7, cardio: -1.0, durability: 1.4, strength: 2.0 },
    defence: {
      power:
        'Explosive force off a standing start, most visible in the leaping strikes nobody else at 185 could throw. Physical output rather than technique, which was never his advantage.',
      strength:
        'Freestyle wrestling force at Olympic silver level, against middleweights who could not hold or move him regardless of position.',
    },
    notes:
      'The one entry in this file that genuinely is a correlated archetype, and it is flagged rather than hidden. An Olympic freestyle silver medallist with documented extreme explosiveness: Power, Speed and Strength all above +1.9 is the reading the evidence actually supports, not a stereotype filled in from reputation. What keeps it honest is Cardio −1.0 — he faded badly and repeatedly in championship rounds — so even the most gifted athlete here has a hole. If step 7 finds this profile dominant, that is a finding about the engine and not about the placement.',
    disagreement: {
      kind: 'cutModelTooStrict',
      note: 'The strongest single piece of evidence in the file that the weigh-in floor is mis-specified. His cut is 9.8% — the roster the bands were measured against averages 8.2% — and the model still says he cannot make middleweight, which he did for years against the best in the division. The cause is that he is the leanest man in the roster, so almost all of his mass lands in the lean column and the floor rises with it. Whatever else is true, a sub-10% cut must not resolve to notViable.',
      resolution:
        'Resolved by doc 31 section 14.6, and this entry is why the correction has the shape it does. A 9.8% cut resolving to notViable was the single clearest sign that the fight-week ceiling was mis-specified rather than that any one constant was off: he missed by 0.8 lb, and no assumption feeding that verdict was more than a few tenths from a defensible value. Splitting the transient term into gut content, glycogen and dehydration puts him at typical.',
    },
  },
  {
    id: 'cal_weidman',
    name: 'Chris Weidman',
    measured: { sex: 'male', division: MW, heightInches: 74, reachInches: 78 },
    estimated: { walkingWeightLbs: 205, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: 0, speed: -0.1, cardio: 0.4, durability: 0.2, strength: 1.1 },
    notes:
      'A middleweight champion whose only elevated physical is Strength. Ordinary, and the division needs ordinary entries as much as it needs Romero. Power 0.0, Speed −0.1, Cardio +0.4 and Durability +0.2 all sit within half a sigma of the middleweight median, which makes Strength +1.1 the only distinguishing physical he has.',
  },
  {
    id: 'cal_till',
    name: 'Darren Till',
    measured: { sex: 'male', division: MW, heightInches: 72, reachInches: 74 },
    estimated: { walkingWeightLbs: 205, confidence: 'good', bodyFatIndex: 55, waterCutIndex: 85 },
    alsoFought: [WW],
    placement: { power: 0.2, speed: 0, cardio: -0.6, durability: 0.4, strength: 0.4 },
    notes:
      'The huge-cutter case, and the reason his `alsoFought` matters: he made 170 from this body for years, missed it once badly, and eventually moved up. The welterweight half of that history is the sort of thing the body model should struggle with, which is why it is recorded. Power +0.2, Speed 0.0, Durability +0.4 and Strength +0.4 are all near the division median, and Cardio −0.6 is the one real negative, on a fighter whose third rounds were visibly worse than his first.',
  },
  {
    id: 'cal_brunson',
    name: 'Derek Brunson',
    measured: { sex: 'male', division: MW, heightInches: 73, reachInches: 77 },
    estimated: { walkingWeightLbs: 200, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 50 },
    placement: { power: 0.6, speed: 0.3, cardio: -0.3, durability: -0.4, strength: 0.8 },
    notes:
      'Two placements below the divisional centre and none above +0.8. A long-serving ranked contender who was never elite, which is the most common shape in the sport and the easiest to leave out of a calibration set. Power +0.6 and Strength +0.8 are mild positives from a wrestling base, Speed +0.3 is ordinary, and Cardio −0.3 with Durability −0.4 are the two below the centre, on a record of late stoppages.',
  },
  {
    id: 'cal_gastelum',
    name: 'Kelvin Gastelum',
    measured: { sex: 'male', division: MW, heightInches: 69, reachInches: 71 },
    estimated: { walkingWeightLbs: 200, confidence: 'good', bodyFatIndex: 65, waterCutIndex: 85 },
    alsoFought: [WW],
    placement: { power: 0.6, speed: 0.2, cardio: 0.1, durability: 1.0, strength: 0.6 },
    notes:
      "Short and thick, and the file's clearest weight-cut disagreement candidate: he fought at welterweight from this body and missed the limit more than once before moving up. If the model calls 170 impossible for him, the model and the record are both partly right, and the entry says so. Power +0.6 and Strength +0.6 are modest for a man fighting well above his natural weight, Speed +0.2 and Cardio +0.1 are unremarkable, and Durability +1.0 is the one that carried him through fights he was losing.",
  },
  {
    id: 'cal_cannonier',
    name: 'Jared Cannonier',
    measured: { sex: 'male', division: MW, heightInches: 71, reachInches: 77 },
    estimated: { walkingWeightLbs: 200, confidence: 'good', bodyFatIndex: 40, waterCutIndex: 70 },
    alsoFought: [LHW, HW],
    placement: { power: 1.4, speed: 0.4, cardio: -0.2, durability: 0.6, strength: 1.2 },
    notes:
      'The most valuable entry in the file for step 7: the same man competed at heavyweight, light heavyweight and middleweight, so the mass law can be tested across nearly eighty pounds while the human being stays fixed. Long reach for 5\'11" as well. Power +1.4 is the placement he is known for and it is genuine, Strength +1.2 comes from a body that started at heavyweight, Speed +0.4 and Durability +0.6 are ordinary, and Cardio −0.2 is the honest reading of championship rounds he did not win.',
  },
  {
    id: 'cal_vettori',
    name: 'Marvin Vettori',
    measured: { sex: 'male', division: MW, heightInches: 72, reachInches: 74 },
    estimated: { walkingWeightLbs: 200, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 55 },
    placement: { power: -0.4, speed: -0.5, cardio: 1.5, durability: 1.2, strength: 0.5 },
    notes:
      'Low power and below-average speed carried by pace and a chin — a top-five middleweight whose two best physicals are the two that do not hurt anybody. The inverse of Thiago Santos, and both need to exist. Cardio +1.5 and Durability +1.2 are what a fighter with Power −0.4 and Speed −0.5 has to win with, and Strength +0.5 is the mild positive of a pressure grappler.',
  },

  {
    id: 'cal_anderson_silva',
    name: 'Anderson Silva',
    measured: { sex: 'male', division: MW, heightInches: 74, reachInches: 77 },
    estimated: { walkingWeightLbs: 205, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 55 },
    placement: { power: 1.5, speed: 2.0, cardio: 0.3, durability: -0.6, strength: -0.5 },
    defence: {
      speed:
        'Limb velocity over a decade at 185, separable from his famous timing and evasion by the fact that his hands were measurably first even in exchanges he lost positionally.',
    },
    notes:
      'Speed +2.0 is the middleweight ceiling and the least controversial placement in the division — the fastest hands anyone had seen at 185 lb, over a decade. Power +1.5 alongside it is genuine. What makes the entry worth having is the other three: Strength −0.5 for a man who was consistently held down by wrestlers he was far better than, Durability −0.6 on a record with several stoppage losses, and Cardio +0.3 for someone whose fights rarely needed the championship rounds. Fast, powerful, and neither strong nor durable is a shape the correlated-archetype problem makes impossible.',
  },
  {
    id: 'cal_uriah_hall',
    name: 'Uriah Hall',
    measured: { sex: 'male', division: MW, heightInches: 72, reachInches: 79 },
    estimated: { walkingWeightLbs: 200, confidence: 'poor', bodyFatIndex: 38, waterCutIndex: 50 },
    placement: { power: 1.3, speed: 1.2, cardio: -0.4, durability: -0.9, strength: 0.2 },
    notes:
      'A seven-inch ape index — the longest relative reach in the men’s file — on a genuinely explosive athlete, and a career that never matched either. Power +1.3 and Speed +1.2 are what everybody saw in the gym; Durability −0.9 and Cardio −0.4 are what happened in fights, and the pairing is the reason he belongs here. An athlete whose physicals are well above his division while his results are not is a case the simulation has to be able to represent, or physical ratings quietly become a ranking.',
  },
  // --- Welterweight ------------------------------------------------------------------------
  {
    id: 'cal_usman',
    name: 'Kamaru Usman',
    measured: { sex: 'male', division: WW, heightInches: 72, reachInches: 76 },
    estimated: { walkingWeightLbs: 190, confidence: 'good', bodyFatIndex: 30, waterCutIndex: 70 },
    placement: { power: 0.3, speed: 0.4, cardio: 2.6, durability: 1.1, strength: 2.0 },
    defence: {
      cardio:
        'Sustained output for five rounds while carrying an opponent, which is work capacity under load rather than pacing. He finished championship rounds stronger than he started them.',
      strength:
        'Clinch and top-control force. His wrestling technique is good rather than exceptional and he wins those positions anyway, which is the separation.',
    },
    notes:
      'Cardio and Strength at the top of the division with Power +0.3 — he drowned people rather than hurting them, and the placement should say so plainly. Speed +0.4 and Durability +1.1 are both ordinary-to-mild for the division, which leaves a champion whose two elevated physicals are the two least visible on a highlight reel. A severe but routine cutter.',
  },
  {
    id: 'cal_gsp',
    name: 'Georges St-Pierre',
    measured: { sex: 'male', division: WW, heightInches: 70, reachInches: 76 },
    estimated: { walkingWeightLbs: 190, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 70 },
    alsoFought: [MW],
    placement: { power: 0.1, speed: 1.2, cardio: 1.5, durability: 0.8, strength: 1.3 },
    notes:
      "A six-inch ape index — the longest reach for height in the men's file — and Power +0.1, which is the honest reading of a champion who almost never finished anyone with strikes. A mover up two divisions at the end of his career. Speed +1.2, Strength +1.3, Cardio +1.5 and Durability +0.8 are all above the divisional centre without any of them being exceptional, which with Power +0.1 is the most complete argument in the file that skill rather than physique decides careers.",
  },
  {
    id: 'cal_covington',
    name: 'Colby Covington',
    measured: { sex: 'male', division: WW, heightInches: 71, reachInches: 72 },
    estimated: { walkingWeightLbs: 185, confidence: 'fair', bodyFatIndex: 45, waterCutIndex: 65 },
    placement: { power: -1.3, speed: 0.2, cardio: 2.8, durability: 0.8, strength: 0.7 },
    defence: {
      cardio:
        'Volume maintained for twenty-five minutes at a rate nobody in the division matched, in fights he was losing on damage — so it is capacity rather than a comfortable pace.',
    },
    notes:
      'The low-Power anchor: an elite fighter at −1.3σ in the one attribute that ends fights, and a Cardio placement at the top of the sport. Doc 31 § 5 uses him for exactly this — a rating in the band the old scale called "a hole opponents will find", on a man who was very hard to beat. Speed +0.2 is entirely ordinary, Strength +0.7 is a wrestling positive rather than a physical outlier, and Durability +0.8 is a chin that held up across five-round fights he spent losing exchanges.',
  },
  {
    id: 'cal_woodley',
    name: 'Tyron Woodley',
    measured: { sex: 'male', division: WW, heightInches: 69, reachInches: 74 },
    estimated: { walkingWeightLbs: 190, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 70 },
    placement: { power: 1.8, speed: 1.3, cardio: -1.2, durability: 0.2, strength: 1.2 },
    defence: {
      power:
        'One-shot force off the right hand, delivered from a static stance with no setup. Timing is a real part of his game and is rated elsewhere; the men he hit did not get up.',
    },
    notes:
      'Short, thick and explosive with a documented gas problem. Cardio −1.2 next to Power +1.8 is the combination the correlated model cannot make. Speed +1.3 for explosive single bursts, Strength +1.2 from a wrestling base, and Durability +0.2 exactly ordinary, which with Cardio −1.2 gives the profile of a fighter who had two minutes of the best physical tools in the division and then did not.',
  },
  {
    id: 'cal_wonderboy',
    name: 'Stephen Thompson',
    measured: { sex: 'male', division: WW, heightInches: 72, reachInches: 75 },
    estimated: { walkingWeightLbs: 180, confidence: 'good', bodyFatIndex: 25, waterCutIndex: 40 },
    placement: { power: 0.1, speed: 1.7, cardio: 0.5, durability: 0.1, strength: -1 },
    notes:
      "The competes-close-to-walking-weight case: 180 lb for a 170 lb division, the smallest margin in the men's file. Strength −1.0 is the other half of the coverage — he was routinely out-grappled by men he could not physically hold off. Power +0.1 and Durability +0.1 sit at the division median, Speed +1.7 is the attribute the entire karate style depends on, and Cardio +0.5 is the mild positive of somebody who fights at range for five rounds.",
  },
  {
    id: 'cal_masvidal',
    name: 'Jorge Masvidal',
    measured: { sex: 'male', division: WW, heightInches: 71, reachInches: 74 },
    estimated: { walkingWeightLbs: 185, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 60 },
    alsoFought: [LW],
    placement: { power: 0.7, speed: 0.4, cardio: -0.1, durability: 1.1, strength: -0.1 },
    notes:
      'A twenty-year career and one elevated physical, which is durability. Ordinary otherwise, and a mover up from lightweight early on. Power +0.7 and Speed +0.4 are ordinary for the division despite a highlight reel, Strength −0.1 is at the centre, and Cardio −0.1 is the honest reading of a fighter who won early or not at all.',
  },
  {
    id: 'cal_edwards',
    name: 'Leon Edwards',
    measured: { sex: 'male', division: WW, heightInches: 72, reachInches: 74 },
    estimated: { walkingWeightLbs: 185, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 60 },
    placement: { power: 0.2, speed: 0.6, cardio: 0.7, durability: 0.3, strength: -0.2 },
    notes:
      'A champion with no placement above +0.7. Deliberately unremarkable across the board, because a calibration set where every titleholder is exceptional would misrepresent what winning a title requires. Power +0.2, Speed +0.6, Cardio +0.7, Durability +0.3 and Strength −0.2 are all inside three quarters of a sigma of the welterweight median, which is the whole point of the entry.',
  },
  {
    id: 'cal_burns',
    name: 'Gilbert Burns',
    measured: { sex: 'male', division: WW, heightInches: 70, reachInches: 71 },
    estimated: { walkingWeightLbs: 185, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 65 },
    alsoFought: [LW],
    placement: { power: 1, speed: 0.5, cardio: -0.5, durability: 0.1, strength: 0.8 },
    notes:
      'Short reach for the division — one inch of ape index — and a mover up from lightweight. Power +1.0 on a jiu-jitsu world champion, which is the sort of combination a reputation-driven placement would miss. Speed +0.5 and Durability +0.1 are ordinary, Strength +0.8 comes from a grappling base, and Cardio −0.5 is the placement that explains why his best work happens in the first round.',
  },
  {
    id: 'cal_maia',
    name: 'Demian Maia',
    measured: { sex: 'male', division: WW, heightInches: 72, reachInches: 72 },
    estimated: { walkingWeightLbs: 185, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 55 },
    alsoFought: [MW],
    placement: { power: -0.8, speed: -0.8, cardio: 0, durability: -0.2, strength: 0.1 },
    notes:
      'The clearest physically-unremarkable-elite-technician in the file: every placement inside 0.8σ of the divisional centre, no ape index at all, and a title challenge in two divisions on grappling alone. If the simulation cannot make this man competitive, the technical attributes are not doing enough work. Power −0.8, Speed −0.8, Cardio 0.0, Durability −0.2 and Strength +0.1 together describe a man with no physical advantage over anybody in his division, which is exactly why he is in this file.',
  },

  {
    id: 'cal_nate_diaz',
    name: 'Nate Diaz',
    measured: { sex: 'male', division: WW, heightInches: 72, reachInches: 76 },
    estimated: { walkingWeightLbs: 180, confidence: 'fair', bodyFatIndex: 40, waterCutIndex: 40 },
    placement: { power: -0.6, speed: 0.2, cardio: 1.9, durability: 1.7, strength: -1.2 },
    alsoFought: [LW],
    defence: {
      cardio:
        'Twenty years of five-round pace with no decline within a fight, including rounds where he was badly hurt. Endurance capacity rather than pacing or toughness, the latter being Durability and rated separately.',
    },
    notes:
      'The small welterweight with essentially no cut, and the weakest man in the division in this file. Strength −1.2 is not a slight: he is out-wrestled and held against the fence by welterweights as a matter of routine, and he competes at 170 because he walks around near it rather than because the weight suits him. Power −0.6 for a boxer who wins by volume and cuts rather than by force. Cardio +1.9 and Durability +1.7 are the two that carried a twenty-year career, and having both of those on a fighter who is weak and does not punch hard is exactly the decorrelation this file exists to record.',
  },
  {
    id: 'cal_condit',
    name: 'Carlos Condit',
    measured: { sex: 'male', division: WW, heightInches: 74, reachInches: 76 },
    estimated: { walkingWeightLbs: 190, confidence: 'poor', bodyFatIndex: 42, waterCutIndex: 50 },
    placement: { power: 0.8, speed: 0.7, cardio: 1.2, durability: -0.4, strength: -0.7 },
    notes:
      'A high-volume pressure fighter who was never physically imposing. Cardio +1.2 is the attribute the style is built on and it is well attested across five-round fights. Strength −0.7 and Durability −0.4 are the costs — he was reliably taken down by the division’s wrestlers and his career ended in a run of stoppages. Power +0.8 is above the divisional centre without being remarkable, which is the honest reading of a long finishing record built on accumulation.',
  },
  // --- Lightweight -------------------------------------------------------------------------
  {
    id: 'cal_khabib',
    name: 'Khabib Nurmagomedov',
    measured: { sex: 'male', division: LW, heightInches: 70, reachInches: 70 },
    estimated: { walkingWeightLbs: 175, confidence: 'good', bodyFatIndex: 55, waterCutIndex: 80 },
    placement: { power: 0, speed: 0.3, cardio: 1.7, durability: 1.6, strength: 2.0 },
    defence: {
      strength:
        'Grip and control force under an opponent who is actively resisting. Distinct from his grappling technique, which is also elite: opponents who defend the entry correctly still cannot get up.',
    },
    notes:
      'No ape index, a famously severe cut, and Power +0.0 — an undefeated champion who almost never hurt anyone with a strike. Strength +2.0 is the placement his whole career rests on. Speed +0.3 is ordinary and deliberately so, Cardio +1.7 and Durability +1.6 are both well evidenced across five-round fights nobody won a round of, and together with Strength +2.0 they describe a grappler rather than an athlete.',
  },
  {
    id: 'cal_mcgregor',
    name: 'Conor McGregor',
    measured: { sex: 'male', division: LW, heightInches: 69, reachInches: 74 },
    estimated: { walkingWeightLbs: 170, confidence: 'good', bodyFatIndex: 30, waterCutIndex: 65 },
    alsoFought: [FW, WW],
    placement: { power: 2, speed: 1.9, cardio: -0.6, durability: -0.5, strength: -0.2 },
    defence: {
      power:
        'Force on the left hand, evidenced by opponents dropped by shots that landed only partially. Accuracy and timing are separately elite and rated in the technical attributes; this is what the shot does when it arrives.',
      speed:
        'Hand velocity in the first two rounds, before the Cardio placement takes hold. Not his distance management, which is technique.',
    },
    notes:
      'Three divisions fought, which makes him one of the two best mass-law tests here. Power and Speed at the top of the division with Strength −0.2 and Durability −0.5: enormous in the two attributes that land first and ordinary-to-poor in everything that happens afterwards, which is what the record shows.',
  },
  {
    id: 'cal_ferguson',
    name: 'Tony Ferguson',
    measured: { sex: 'male', division: LW, heightInches: 71, reachInches: 76 },
    estimated: { walkingWeightLbs: 172, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 70 },
    placement: { power: 0, speed: 0.6, cardio: 2.4, durability: 2.5, strength: 0.3 },
    defence: {
      cardio:
        'Work capacity across five rounds at an unbroken pace, sustained in fights where he was taking damage throughout. Style-independent: it held whether he was winning or not.',
      durability:
        "Impulse to concuss, from years of absorbing clean shots from the division's hardest hitters without going out. Deliberately placed at prime: the later knockouts are the damage system doing its job, not evidence that the underlying threshold was ever low.",
    },
    notes:
      "The Durability anchor for the men's file at +2.5σ, alongside a five-inch ape index. Power +0.0 and Strength +0.3 are both ordinary — this is a fighter who won by absorbing and out-lasting, not by hurting people.",
  },
  {
    id: 'cal_gaethje',
    name: 'Justin Gaethje',
    measured: { sex: 'male', division: LW, heightInches: 71, reachInches: 70 },
    estimated: { walkingWeightLbs: 172, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 70 },
    placement: { power: 1.9, speed: 0.8, cardio: 0.5, durability: 0.4, strength: 0.6 },
    defence: {
      power:
        'Force per strike, including leg kicks that visibly compromised opponents inside a round. Not accuracy and not volume, both of which are ordinary for him.',
    },
    notes:
      "A negative ape index — the shortest reach for height in the men's file. Durability +0.4 rather than higher is a deliberate call and the hardest in this entry: he absorbs extraordinary punishment, and he has also been knocked out cleanly more than once. Taking punishment and having a chin are different claims, and only the second is what this attribute measures. Power +1.9 is the second-hardest hitter in the division, Speed +0.8 and Strength +0.6 are ordinary, and Cardio +0.5 is modest for a fighter whose style would seem to demand more.",
  },
  {
    id: 'cal_poirier',
    name: 'Dustin Poirier',
    measured: { sex: 'male', division: LW, heightInches: 69, reachInches: 72 },
    estimated: { walkingWeightLbs: 170, confidence: 'fair', bodyFatIndex: 45, waterCutIndex: 65 },
    alsoFought: [FW],
    placement: { power: 1.5, speed: 0.5, cardio: 0.6, durability: 0.3, strength: 0.4 },
    notes:
      'A mover up from featherweight and a fighter with one very high placement and four ordinary ones. Strength +0.4 despite a long career of grappling exchanges, because the attribute is absolute force rather than technique. Power +1.5 is genuine and Speed +0.5, Cardio +0.6 and Durability +0.3 are all close to the divisional centre, which is the shape of a boxer who wins on hands rather than on athleticism.',
  },
  {
    id: 'cal_oliveira',
    name: 'Charles Oliveira',
    measured: { sex: 'male', division: LW, heightInches: 70, reachInches: 74 },
    estimated: { walkingWeightLbs: 172, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 70 },
    alsoFought: [FW],
    placement: { power: 0.6, speed: 0.7, cardio: 0.6, durability: -0.6, strength: -0.3 },
    notes:
      'A champion carrying two placements below the divisional centre, including Durability −0.6 on a record with several early stoppage losses. A mover up from featherweight, where he missed weight repeatedly — useful when the body model is asked whether 145 was ever realistic for him. Power +0.6 and Speed +0.7 are both ordinary for the division, and Cardio +0.6 with Strength −0.3 completes a profile whose value is entirely in submission grappling rather than in these five.',
  },
  {
    id: 'cal_makhachev',
    name: 'Islam Makhachev',
    measured: { sex: 'male', division: LW, heightInches: 70, reachInches: 70 },
    estimated: { walkingWeightLbs: 175, confidence: 'good', bodyFatIndex: 50, waterCutIndex: 80 },
    placement: { power: 0.1, speed: 0.5, cardio: 1.3, durability: 1.0, strength: 1.7 },
    notes:
      'Strength and Cardio elevated, Power ordinary — a similar shape to Khabib and placed independently rather than by association, which is why the numbers are not identical. Strength +1.7 and Cardio +1.3 both sit below his training partners, Power +0.1 is at the division median on a record whose knockouts came from ground strikes, and Speed +0.5 with Durability +1.0 are unremarkable for lightweight.',
  },
  {
    id: 'cal_chandler',
    name: 'Michael Chandler',
    measured: { sex: 'male', division: LW, heightInches: 68, reachInches: 71 },
    estimated: { walkingWeightLbs: 175, confidence: 'fair', bodyFatIndex: 25, waterCutIndex: 75 },
    placement: { power: 1.5, speed: 1.1, cardio: -0.4, durability: 0.5, strength: 1.5 },
    notes:
      'The shortest man in the lightweight set and among the thickest. Cardio −0.4 is what keeps him from reading as a straightforward athletic freak, and it matches a career of fast starts and difficult third rounds. Power +1.5 and Strength +1.5 are both genuine and both from the same explosive wrestling base, Speed +1.1 is real, and Durability +0.5 is ordinary for a fighter who has been dropped and got up.',
    disagreement: {
      kind: 'cutModelTooStrict',
      note: "An 11.4% cut, which the model's own bands call severe rather than impossible, coming back as notViable. He is short and extremely dense for lightweight, so the height-cubed lean-mass fit and the even frame/muscle split in physiqueForMeasurements both push mass into the lean column, and the floor follows it. The same body at a slightly higher body-fat estimate would pass, which is a sign the verdict is being decided by an inference rather than by the fighter.",
      resolution:
        'Resolved by doc 31 section 14.6, and refiled: the original classification of compositionInference was wrong. The frame/muscle split does not enter the floor when height and walking weight are held, so his density cannot have been the cause. The cause was the same undifferentiated fight-week pool that rejected Pereira and Romero, and he missed by 0.5 lb. He now reads severe at 11.4%, which is the right description of a lightweight cut from 175.',
    },
  },
  {
    id: 'cal_iaquinta',
    name: 'Al Iaquinta',
    measured: { sex: 'male', division: LW, heightInches: 71, reachInches: 70 },
    estimated: { walkingWeightLbs: 170, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 60 },
    placement: { power: 0, speed: -0.1, cardio: -0.2, durability: 0.6, strength: 0.2 },
    notes:
      "Five placements inside one sigma: the division-median entry, and the one this file needs most. A ranked lightweight who once took a title fight on a day's notice, with nothing physically remarkable about him at all. Power 0.0, Speed −0.1, Cardio −0.2, Durability +0.6 and Strength +0.2 place him at the lightweight median on all five, which is the most ordinary entry in the division and a necessary one.",
  },

  {
    id: 'cal_rda',
    name: 'Rafael dos Anjos',
    measured: { sex: 'male', division: LW, heightInches: 68, reachInches: 70 },
    estimated: { walkingWeightLbs: 172, confidence: 'fair', bodyFatIndex: 42, waterCutIndex: 60 },
    placement: { power: 0.4, speed: 0.1, cardio: 1.1, durability: 0.6, strength: 1.2 },
    alsoFought: [WW],
    notes:
      "A cross-division mover with a long career on both sides of the line, which makes him one of the more useful entries in the file for step 7 — the same body at 155 and at 170, with the sport's own verdict on how it went. Strength +1.2 is the standout and is what carried the move up; Power +0.4 is ordinary for lightweight and got noticeably less effective at welterweight, which is exactly what an absolute scale predicts and a division-relative one cannot express. Speed +0.1 and Durability +0.6 are unremarkable. Cardio +1.1 for a pressure fighter who works five rounds.",
  },
  {
    id: 'cal_dariush',
    name: 'Beneil Dariush',
    measured: { sex: 'male', division: LW, heightInches: 70, reachInches: 72 },
    estimated: { walkingWeightLbs: 170, confidence: 'poor', bodyFatIndex: 48, waterCutIndex: 55 },
    placement: { power: -0.2, speed: -0.1, cardio: 0.5, durability: 0.2, strength: 0.6 },
    notes:
      "Deliberately ordinary, and the division badly needs it. Lightweight in this file is otherwise a collection of the sport's most famous punchers — McGregor, Gaethje, Poirier, Chandler — and a roster drawn only from them puts the division's Power median above welterweight's, which is the selection bias this criterion exists to catch. He is a long-tenured top-ten fighter with nothing above +0.6 in any direction, who wins on grappling and pace. Speed −0.1, Cardio +0.5, Durability +0.2 and Strength +0.6 are all within two thirds of a sigma of the division median, and none of them is the reason he wins.",
  },
  // --- Featherweight -----------------------------------------------------------------------
  {
    id: 'cal_volkanovski',
    name: 'Alexander Volkanovski',
    measured: { sex: 'male', division: FW, heightInches: 66, reachInches: 71 },
    estimated: { walkingWeightLbs: 165, confidence: 'good', bodyFatIndex: 35, waterCutIndex: 85 },
    alsoFought: [LW],
    placement: { power: 0.9, speed: 0.6, cardio: 1.9, durability: 1.2, strength: 2.0 },
    defence: {
      cardio:
        'Championship-round output at a rate that did not fall, in fights decided on volume. A rugby front-rower engine rather than a pacing strategy.',
      strength:
        'Clinch and takedown-defence force at 145 against fighters he gives up height to. Physical rather than technical: he is not the better wrestler in most of those exchanges and still cannot be taken down.',
    },
    notes:
      'Short, extremely thick, a five-inch ape index and the heaviest walking weight for the division in the file — a former rugby front-rower who cut to 145. The severe-cut case at featherweight, and a mover up to lightweight. Strength +2.0 is the front-row inheritance and the highest in the division, Cardio +1.9 is what five-round title fights demonstrated, Power +0.9 and Durability +1.2 are strong without being exceptional, and Speed +0.6 is deliberately ordinary.',
  },
  {
    id: 'cal_holloway',
    name: 'Max Holloway',
    measured: { sex: 'male', division: FW, heightInches: 71, reachInches: 69 },
    estimated: { walkingWeightLbs: 160, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 60 },
    alsoFought: [LW],
    placement: { power: 0, speed: 0.8, cardio: 2.4, durability: 2.2, strength: -0.7 },
    defence: {
      cardio:
        'Output that rises through five rounds, measured on strike counts rather than on impressions. Capacity, not pace management.',
      durability:
        'Impulse to concuss, from an unusually well-documented case: he has absorbed extreme volume from hard hitters across many fights and been stopped by strikes almost never. Explicitly not defence — he chooses to be hit — and placed at prime rather than reading anything off accumulated wear.',
    },
    notes:
      'Tall and light-framed with a *negative* ape index — 5\'11" and a 69" reach, the largest height-over-reach gap in the file. Cardio and Durability at the top of the division with Power +0.0 and Strength −0.7: a volume fighter with no force behind it, which is the honest reading.',
  },
  {
    id: 'cal_aldo',
    name: 'José Aldo',
    measured: { sex: 'male', division: FW, heightInches: 67, reachInches: 70 },
    estimated: { walkingWeightLbs: 163, confidence: 'good', bodyFatIndex: 35, waterCutIndex: 80 },
    alsoFought: [BW],
    placement: { power: 1.6, speed: 1.4, cardio: -0.2, durability: 0.1, strength: 0.8 },
    notes:
      'A rare downward mover — featherweight to bantamweight, late in a long career — which makes him valuable in the direction step 7 has least evidence for. Cardio −0.2 rather than higher: his third rounds were routinely his worst. Power +1.6 is the leg-kick and counter force that defined a title reign, Speed +1.4 is real, Strength +0.8 is a modest positive, and Durability +0.1 sits at the division median on a career with several stoppages in it.',
  },
  {
    id: 'cal_ortega',
    name: 'Brian Ortega',
    measured: { sex: 'male', division: FW, heightInches: 68, reachInches: 69 },
    estimated: { walkingWeightLbs: 160, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 70 },
    placement: { power: -0.2, speed: -0.2, cardio: 0.8, durability: 0.9, strength: -0.2 },
    notes:
      'Physically ordinary and a title challenger twice on submission grappling and a chin. Four of five placements inside a sigma. Power −0.2, Speed −0.2 and Strength −0.2 are all just below the featherweight median, Cardio +0.8 is a mild positive, and Durability +0.9 is the one attribute that kept him in fights he was losing badly.',
  },
  {
    id: 'cal_yair',
    name: 'Yair Rodríguez',
    measured: { sex: 'male', division: FW, heightInches: 71, reachInches: 71 },
    estimated: { walkingWeightLbs: 158, confidence: 'poor', bodyFatIndex: 25, waterCutIndex: 60 },
    placement: { power: 0.3, speed: 1.9, cardio: 0.4, durability: -0.1, strength: -1.0 },
    defence: {
      speed:
        'Limb velocity in unorthodox positions where timing cannot help, most obviously in spinning and jumping strikes thrown from stationary. Athletic output rather than technique.',
    },
    notes:
      "Tall, very light-framed, and Strength −1.0 — the weakest-for-division placement in the men's file. Speed +1.9 alongside it, which is the pairing the archetype problem makes hardest to produce. Power +0.3 and Cardio +0.4 are both ordinary for the division, and Durability −0.1 sits at the median, which leaves the entry as one extreme positive and one extreme negative on an otherwise average featherweight.",
  },
  {
    id: 'cal_zombie',
    name: 'Chan Sung Jung',
    measured: { sex: 'male', division: FW, heightInches: 67, reachInches: 72 },
    estimated: { walkingWeightLbs: 160, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 70 },
    placement: { power: 0.3, speed: 0.2, cardio: 0.6, durability: 0.5, strength: 0.1 },
    notes:
      'A five-inch ape index on a 5\'7" frame and otherwise an ordinary athlete who fought for a title on pace and toughness. Power +0.3, Speed +0.2, Cardio +0.6, Durability +0.5 and Strength +0.1 are all inside two thirds of a sigma, and the ape index is a geometric fact rather than a physical rating.',
  },
  {
    id: 'cal_kattar',
    name: 'Calvin Kattar',
    measured: { sex: 'male', division: FW, heightInches: 71, reachInches: 72 },
    estimated: { walkingWeightLbs: 160, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 60 },
    placement: { power: 0.8, speed: -0.1, cardio: 0.6, durability: 1.5, strength: 0.2 },
    notes:
      'Durability +1.5 on the evidence of a five-round beating he finished on his feet, with Speed −0.1 — hittable, and extremely hard to stop. The opposite trade from Rodríguez. Power +0.8 is above the divisional centre without being an anchor, Cardio +0.6 is mild, and Strength +0.2 sits at the median, so the entry rests almost entirely on the one attribute it is here to calibrate.',
  },
  {
    id: 'cal_topuria',
    name: 'Ilia Topuria',
    measured: { sex: 'male', division: FW, heightInches: 67, reachInches: 69 },
    estimated: { walkingWeightLbs: 163, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 80 },
    placement: { power: 1.8, speed: 0.6, cardio: 0.5, durability: 0.3, strength: 1.4 },
    defence: {
      power:
        'Force at featherweight against opponents who had not been hurt before, including through guard. Not accumulation.',
    },
    notes:
      "The featherweight Power anchor. Placed at +1.8 rather than higher because the division ladder should still put his absolute force well below a middleweight's — doc 31 § 5's flyweight-versus-heavyweight comparison, one rung up. Strength +1.4 is the second placement doing real work, from a body that is visibly denser than the division, while Speed +0.6, Cardio +0.5 and Durability +0.3 are all ordinary for featherweight.",
  },
  {
    id: 'cal_swanson',
    name: 'Cub Swanson',
    measured: { sex: 'male', division: FW, heightInches: 68, reachInches: 71 },
    estimated: { walkingWeightLbs: 158, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 65 },
    placement: { power: 0.5, speed: 0.4, cardio: 0.2, durability: -0.6, strength: -0.1 },
    notes:
      'A twenty-year contender who was never champion, with two placements below the centre. The ordinary case the division needs. Power +0.5, Speed +0.4, Cardio +0.2 and Strength −0.1 are all close to the featherweight median, and Durability −0.6 is the mild negative of a career with a long run of stoppage losses in it.',
  },

  // --- Bantamweight -------------------------------------------------------------------------
  {
    id: 'cal_merab',
    name: 'Merab Dvalishvili',
    measured: { sex: 'male', division: BW, heightInches: 66, reachInches: 68 },
    estimated: { walkingWeightLbs: 155, confidence: 'good', bodyFatIndex: 30, waterCutIndex: 80 },
    placement: { power: -0.8, speed: 0.5, cardio: 2.9, durability: 1.4, strength: 1.4 },
    defence: {
      cardio:
        'The highest work rate in the sport measured by takedown attempts and pressure over twenty-five minutes, sustained in fights where the pace was not producing points. Capacity rather than style.',
    },
    notes:
      "The Cardio anchor for the men's file at +2.9σ, and the other half of doc 31 § 5's comparison with Velasquez — an elite bantamweight engine should out-rate the best heavyweight one on an absolute scale. Power −0.8 is the placement that keeps him honest. Speed +0.5 is ordinary, Strength +1.4 is the wrestling base that produces the takedown volume, and Durability +1.4 is a chin nobody in the division has found.",
    disagreement: {
      kind: 'cutModelTooStrict',
      note: "A 12.9% cut called impossible. That is a hard cut and nobody would pretend otherwise, but it is well inside the hand-authored roster's observed maximum of 20.7% and well inside what bantamweights routinely do. The model's floor is landing above the limit for a fighter whose whole competitive identity is that he does make 135, on short notice, repeatedly.",
      resolution:
        'Resolved by doc 31 section 14.6. He missed by 1.5 lb and now reads severe, which is what a 12.9% cut is: hard, repeatable by this particular body, and nothing anybody should call routine. The verdict the model could not previously express is exactly this one — dangerous without being impossible.',
    },
  },
  {
    id: 'cal_dillashaw',
    name: 'TJ Dillashaw',
    measured: { sex: 'male', division: BW, heightInches: 66, reachInches: 67 },
    estimated: { walkingWeightLbs: 150, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 75 },
    alsoFought: [FLW],
    placement: { power: 0.6, speed: 1.4, cardio: 0.8, durability: 0.3, strength: 0.2 },
    notes:
      'A downward mover to flyweight, which he made once and badly — a useful case for asking whether the body model agrees that 125 was available to him. Speed elevated, force ordinary. Power +0.6 is ordinary, Cardio +0.8 is a mild positive, Durability +0.3 sits at the division median, and Strength +0.2 is the same, which leaves Speed as the only attribute that separates him.',
  },
  {
    id: 'cal_yan',
    name: 'Petr Yan',
    measured: { sex: 'male', division: BW, heightInches: 67, reachInches: 67 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 70 },
    placement: { power: 0.8, speed: 0.4, cardio: 0.9, durability: 1.2, strength: 0.6 },
    notes:
      'Evenly good rather than spiky: four placements between +0.4 and +1.2 and none above. A different shape from most of this file and a common one at the top of a division. Power +0.8, Speed +0.4, Cardio +0.9, Durability +1.2 and Strength +0.6 are all modest positives and none is an outlier, which is the shape being recorded.',
  },
  {
    id: 'cal_sterling',
    name: 'Aljamain Sterling',
    measured: { sex: 'male', division: BW, heightInches: 67, reachInches: 71 },
    estimated: { walkingWeightLbs: 152, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 75 },
    alsoFought: [FW],
    placement: { power: -0.5, speed: 0.4, cardio: 1.2, durability: 0.5, strength: 0.7 },
    notes:
      'A four-inch ape index and Power −0.5 — a champion who finished by submission and decision. A mover up to featherweight after the reign. Speed +0.4 and Durability +0.5 are ordinary, Cardio +1.2 is a genuine positive across five-round fights, and Strength +0.7 comes from a wrestling base rather than from size.',
  },
  {
    id: 'cal_cruz',
    name: 'Dominick Cruz',
    measured: { sex: 'male', division: BW, heightInches: 68, reachInches: 68 },
    estimated: { walkingWeightLbs: 148, confidence: 'fair', bodyFatIndex: 35, waterCutIndex: 60 },
    placement: { power: -0.7, speed: 1.9, cardio: 0.8, durability: 0.2, strength: -0.6 },
    defence: {
      speed:
        'Foot and hand velocity rather than the footwork pattern, which is technique. He is quick even standing still, which is what separates the two.',
    },
    notes:
      "Speed +1.9 with Power −0.7 and Strength −0.6: the purest speed-without-force profile in the men's file, and a long-reigning champion. Cardio +0.8 and Durability +0.2 are both ordinary, which matters: the footwork that made him unhittable is a skill, and the file would be overstating its case if it turned that skill into a physical rating. Competes close to walking weight.",
  },
  {
    id: 'cal_omalley',
    name: "Sean O'Malley",
    measured: { sex: 'male', division: BW, heightInches: 71, reachInches: 72 },
    estimated: { walkingWeightLbs: 150, confidence: 'fair', bodyFatIndex: 20, waterCutIndex: 65 },
    placement: { power: 1.1, speed: 1.1, cardio: -0.1, durability: -0.4, strength: -1.1 },
    notes:
      "The most extreme tall-and-light-framed body in the men's file: 5'11\" competing at 135, five inches taller than the divisional mean. Strength −1.1 is the price and is well documented — he is moved around by everyone who gets hold of him. Power +1.1 is real for the division, Speed +1.1 matches it, Cardio −0.1 sits at the median, and Durability −0.4 is the mild negative of a fighter who has been dropped by people much smaller than the division anchors.",
  },
  {
    id: 'cal_garbrandt',
    name: 'Cody Garbrandt',
    measured: { sex: 'male', division: BW, heightInches: 68, reachInches: 65 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 35, waterCutIndex: 70 },
    placement: { power: 1.2, speed: 1.3, cardio: -0.2, durability: -1.0, strength: 0.1 },
    defence: {
      durability:
        'At −1.0 and worth stating: the knockouts came in his mid-career, not at the end, against bantamweights whose Power placements here are ordinary. That is what makes it a threshold claim rather than a decline claim.',
    },
    notes:
      'A three-inch *negative* ape index, the largest in the file, and Durability −1.0 on a record with several consecutive stoppage losses after a title reign. Fast and powerful and easy to stop — the shape that most needs the physicals to be independent. Speed +1.3 is genuine and matches the Power placement, Cardio −0.2 is at the median, and Strength +0.1 is the same, so the entry is a fast heavy-handed bantamweight with a chin problem and nothing else remarkable.',
  },
  {
    id: 'cal_moraes',
    name: 'Marlon Moraes',
    measured: { sex: 'male', division: BW, heightInches: 66, reachInches: 67 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 70 },
    placement: { power: 1.2, speed: 0.9, cardio: -0.5, durability: -0.6, strength: 0.3 },
    notes:
      'Two placements above +0.9 and two below the centre. A title challenger whose career ended in a run of knockout losses. Power +1.2 and Speed +0.9 are the two positives, Strength +0.3 sits at the median, and Cardio −0.5 with Durability −0.6 are the two negatives that ended the career.',
  },
  {
    id: 'cal_assuncao',
    name: 'Raphael Assunção',
    measured: { sex: 'male', division: BW, heightInches: 66, reachInches: 68 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 70 },
    placement: { power: 0, speed: -0.1, cardio: 0.1, durability: 0.3, strength: 0.5 },
    notes:
      'The bantamweight division-median entry: five placements inside 0.5σ across a decade in the rankings. Power 0.0, Speed −0.1, Cardio +0.1, Durability +0.3 and Strength +0.5 place him within half a sigma of the bantamweight median on all five, which is the entry.',
  },

  {
    id: 'cal_vera',
    name: 'Marlon Vera',
    measured: { sex: 'male', division: BW, heightInches: 68, reachInches: 70 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 55 },
    placement: { power: 0.6, speed: -0.9, cardio: 0.6, durability: 1.6, strength: 0.3 },
    notes:
      'Slow for the class and it has never mattered. Speed −0.9 is visible in every fight — he is beaten to the punch for long stretches — and Durability +1.6 is why that is survivable: he has taken sustained damage from the division’s best strikers and been stopped by none of them. Power +0.6 is real. Bantamweight in this file is otherwise a division of fast, spiky strikers, and a roster where nobody at 135 is slow would produce a Speed median a rating point off the truth.',
  },
  {
    id: 'cal_munhoz',
    name: 'Pedro Munhoz',
    measured: { sex: 'male', division: BW, heightInches: 66, reachInches: 67 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 42, waterCutIndex: 55 },
    placement: { power: 0.5, speed: -0.6, cardio: 0.4, durability: 1.4, strength: 0.7 },
    notes:
      'Short and thick for bantamweight — the men’s small-division counterpart to Carla Esparza — and the second slow fighter the division needs. Durability +1.4 on a long career of standing in the pocket without being finished by strikes, Strength +0.7 from the frame, and Speed −0.6 as the price of both. Power +0.5 is ordinary for a fighter with a reputation for heavy leg kicks, because the reputation is about damage accumulated rather than force delivered.',
  },
  {
    id: 'cal_font',
    name: 'Rob Font',
    measured: { sex: 'male', division: BW, heightInches: 68, reachInches: 71 },
    estimated: { walkingWeightLbs: 148, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: 0.3, speed: 0.2, cardio: 0.4, durability: -0.6, strength: -0.2 },
    notes:
      'A ranked bantamweight who is physically unremarkable in every direction: nothing here is 0.7σ from the divisional centre, and the one placement below it — Durability −0.6, on a record with several stoppage losses — is a mild one. A long jab and good timing are skills, not physicals, and the file needs entries where that distinction is the whole story. Power +0.3, Speed +0.2 and Strength −0.2 are all at the divisional centre, and Cardio +0.4 is the mildest of positives.',
  },
  // --- Flyweight ---------------------------------------------------------------------------
  {
    id: 'cal_dj',
    name: 'Demetrious Johnson',
    measured: { sex: 'male', division: FLW, heightInches: 63, reachInches: 66 },
    estimated: { walkingWeightLbs: 137, confidence: 'fair', bodyFatIndex: 30, waterCutIndex: 60 },
    alsoFought: [BW],
    placement: { power: 0, speed: 2.4, cardio: 2.0, durability: 0.6, strength: 0.4 },
    defence: {
      speed:
        'Limb and whole-body velocity across every phase, distinguishable from his transitional timing because he is faster in isolation than fighters who read him correctly.',
      cardio:
        'Pace across five rounds at flyweight, sustained through grappling exchanges that cost more than striking. Capacity rather than efficiency, though his efficiency is also high and is a technical rating.',
    },
    notes:
      "The Speed anchor for the men's file, and the fighter doc 31 § 5 uses to make the Cardio point: at +2.0σ in a flyweight division his absolute engine should out-rate the best heavyweight's. Power +0.0 is ordinary and correct.",
  },
  {
    id: 'cal_figueiredo',
    name: 'Deiveson Figueiredo',
    measured: { sex: 'male', division: FLW, heightInches: 65, reachInches: 68 },
    estimated: { walkingWeightLbs: 145, confidence: 'good', bodyFatIndex: 40, waterCutIndex: 90 },
    alsoFought: [BW],
    placement: { power: 1.9, speed: 0.8, cardio: 0.2, durability: 0.9, strength: 1.1 },
    defence: {
      power:
        'Force at 125 lb against opponents rarely hurt by anyone else, delivered on single counters. Not volume, which was never his method.',
    },
    notes:
      'The flyweight Power anchor and the most extreme cut in the file: he missed 125 more than once and eventually moved up, so the walking weight here is deliberately at the top of the plausible range. Doc 31 § 5 wants him freakish *for a flyweight* and nowhere near a heavyweight, which is what +1.9σ on a flyweight ladder should produce. Strength +1.1 comes from the same dense body that made the cut impossible, Speed +0.8 and Durability +0.9 are genuine positives, and Cardio +0.2 sits at the division median because his later rounds were routinely his worst.',
    disagreement: {
      kind: 'historicalExtremeCut',
      note: 'This one the model is right about, and it is worth separating from the others in the file for exactly that reason. He missed 125 lb more than once, looked visibly damaged by the cut on several occasions, and eventually moved up a division permanently. A verdict of notViable is a fair description of what was happening, and the entry stays as authored so the model has at least one confirmed case beside the ones where it is wrong.',
      resolution:
        'Partly resolved by doc 31 section 14.6, and deliberately left close to the edge. He now reads severe at 13.9% with about four and a half pounds of headroom against his floor, which is the honest description of a man who made 125 lb repeatedly, missed it more than once, and eventually moved up. A model that called this comfortable would have overcorrected.',
    },
  },
  {
    id: 'cal_moreno',
    name: 'Brandon Moreno',
    measured: { sex: 'male', division: FLW, heightInches: 67, reachInches: 70 },
    estimated: { walkingWeightLbs: 138, confidence: 'fair', bodyFatIndex: 40, waterCutIndex: 70 },
    placement: { power: 0.1, speed: 0.5, cardio: 1.2, durability: 1.7, strength: -0.2 },
    notes:
      'Tall for the division with a long reach, and carried by chin and pace rather than force. Power +0.1 on a multiple-time champion. Speed +0.5 and Strength −0.2 are both ordinary for flyweight, while Cardio +1.2 and Durability +1.7 are the two that let him win fights on volume after taking the worst of the first two rounds.',
  },
  {
    id: 'cal_cejudo',
    name: 'Henry Cejudo',
    measured: { sex: 'male', division: FLW, heightInches: 64, reachInches: 64 },
    estimated: { walkingWeightLbs: 140, confidence: 'fair', bodyFatIndex: 25, waterCutIndex: 80 },
    alsoFought: [BW],
    placement: { power: 0.3, speed: 1.2, cardio: 1.2, durability: 0.8, strength: 2.0 },
    defence: {
      strength:
        'Olympic wrestling force at flyweight and bantamweight. Separable from his technique — which is the best in the division — because opponents who stop the entry still get moved.',
    },
    notes:
      'No ape index at all, an Olympic wrestling gold medal behind the Strength +2.0, and a two-division champion for step 7. Power +0.3 is ordinary — the wrestling pedigree is a strength claim, not a force-on-a-strike claim, and conflating the two is the error this file is written to avoid. Speed +1.2 is Olympic-level and Cardio +1.2 matches it, while Durability +0.8 is a solid positive on a career never stopped by strikes.',
  },
  {
    id: 'cal_benavidez',
    name: 'Joseph Benavidez',
    measured: { sex: 'male', division: FLW, heightInches: 64, reachInches: 65 },
    estimated: { walkingWeightLbs: 138, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 70 },
    alsoFought: [BW],
    placement: { power: 1, speed: 0.6, cardio: 0.4, durability: 0.1, strength: 0.7 },
    notes:
      'A perennial contender in two divisions with one clearly elevated attribute and nothing below the centre. Ordinary-plus, which is most of a good roster. Power +1.0 is above the flyweight centre, Speed +0.6, Cardio +0.4 and Strength +0.7 are all ordinary positives, and Durability +0.1 sits at the median on a career that ended in two knockouts.',
  },
  {
    id: 'cal_pantoja',
    name: 'Alexandre Pantoja',
    measured: { sex: 'male', division: FLW, heightInches: 65, reachInches: 68 },
    estimated: { walkingWeightLbs: 138, confidence: 'poor', bodyFatIndex: 40, waterCutIndex: 70 },
    placement: { power: 0.2, speed: 0.3, cardio: 0.6, durability: 0.6, strength: 0.4 },
    notes:
      'The flyweight division-median champion: nothing above +0.6, a title won on grappling and pace. Power +0.2, Speed +0.3, Cardio +0.6, Durability +0.6 and Strength +0.4 are all mild, which is the claim: a champion who is physically a median flyweight.',
  },
  {
    id: 'cal_kara_france',
    name: 'Kai Kara-France',
    measured: { sex: 'male', division: FLW, heightInches: 63, reachInches: 65 },
    estimated: { walkingWeightLbs: 138, confidence: 'poor', bodyFatIndex: 35, waterCutIndex: 70 },
    placement: { power: 1.4, speed: 0.5, cardio: -0.3, durability: 0.3, strength: 0.5 },
    notes:
      'Power well above the division with everything else ordinary. A common shape and an easy one to leave out. Speed +0.5 and Strength +0.5 are ordinary, Durability +0.3 sits at the division median despite a run of knockout losses late, and Cardio −0.3 is the mild negative.',
  },
  {
    id: 'cal_royval',
    name: 'Brandon Royval',
    measured: { sex: 'male', division: FLW, heightInches: 68, reachInches: 70 },
    estimated: { walkingWeightLbs: 135, confidence: 'fair', bodyFatIndex: 20, waterCutIndex: 55 },
    placement: { power: -0.4, speed: 0.9, cardio: 0.5, durability: -0.5, strength: -1.2 },
    notes:
      "The lightest-framed body in the men's file: 5'8\" walking around 135 for a 125 lb division, and the smallest cut margin here. Strength −1.2 is the lowest men's placement in the file and is the coverage case for physically weak-for-division. Power −0.4 and Durability −0.5 are both below the flyweight centre, Speed +0.9 is the one real positive, and Cardio +0.5 is mild, which together describe a fighter winning on volume and scrambling rather than on physique.",
  },
  {
    id: 'cal_tim_elliott',
    name: 'Tim Elliott',
    measured: { sex: 'male', division: FLW, heightInches: 67, reachInches: 68 },
    estimated: { walkingWeightLbs: 137, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 65 },
    placement: { power: -0.8, speed: -0.1, cardio: 0.7, durability: 0.4, strength: -0.3 },
    notes:
      'Two placements below the centre including Power −0.8, and a long career built entirely on awkwardness and grappling volume. The technical-genius-in-an-ordinary-body case at the bottom of the ladder. Speed −0.1 and Strength −0.3 sit at or just below the flyweight median, Cardio +0.7 is a mild positive, and Durability +0.4 is ordinary on a long career with few stoppages in it.',
  },
  {
    id: 'cal_formiga',
    name: 'Jussier Formiga',
    measured: { sex: 'male', division: FLW, heightInches: 65, reachInches: 66 },
    estimated: { walkingWeightLbs: 137, confidence: 'poor', bodyFatIndex: 48, waterCutIndex: 50 },
    placement: { power: -0.9, speed: -0.3, cardio: 0.4, durability: -0.8, strength: -0.5 },
    notes:
      'Below the divisional centre on four of five, which no other flyweight in this file is, and a top-five fighter for most of a decade regardless. Power −0.9 is the honest reading of a career with essentially no striking finishes; Durability −0.8 of one that ended in knockouts. He won by positional grappling, which the technical attributes own and these five do not. A division where every entry is at or above its own median has a broken bottom half. Speed −0.3 and Strength −0.5 are both below the flyweight centre, and Cardio +0.4 is the only positive in the entry.',
  },
  {
    id: 'cal_schnell',
    name: 'Matt Schnell',
    measured: { sex: 'male', division: FLW, heightInches: 68, reachInches: 70 },
    estimated: { walkingWeightLbs: 138, confidence: 'poor', bodyFatIndex: 58, waterCutIndex: 45 },
    placement: { power: -0.6, speed: 0.2, cardio: 0.5, durability: -1.3, strength: -0.9 },
    defence: {
      durability:
        'At −1.3 on a run of stoppage losses in a division where knockouts are comparatively rare, which makes the same record much stronger evidence than it would be at heavyweight. Not defence — he is hit because he engages — and not late-career, since it runs through his prime.',
    },
    notes:
      'Tall and very light-framed for flyweight — five foot eight at 125 lb, the least mass per inch in the men’s file — and the men’s low-Durability anchor at the bottom of the ladder. Durability −1.3 comes from a run of knockout losses in a division where knockouts are comparatively rare, which makes it better evidence than the same record would be at heavyweight. Strength −0.9 and Power −0.6 follow the frame. Speed +0.2 is deliberately ordinary: length is not quickness, and a long light fighter is not automatically a fast one.',
  },
];
