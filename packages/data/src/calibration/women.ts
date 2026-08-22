/**
 * The women's calibration roster.
 *
 * Doc 31 § 12 step 5, and the companion to `men.ts`. Same discipline: every physical is a **sigma
 * placement against the division's major-promotion median**, never a typed rating.
 *
 * ---
 *
 * ## These sigmas are on the women's ladder, not the men's
 *
 * The single most important thing to understand about this file. `medianRatingAtMass` takes a sex
 * and uses `PIVOT_WALKING_WEIGHT_LBS.female` and `PIVOT_LEAN_FRACTION.female`, so rating 50 here
 * means *the median female professional*, pooled across the four women's divisions — not the median
 * man. Amanda Nunes at Power +2.2σ is the hardest puncher in women's MMA and resolves near the top
 * of the scale; that is the claim being made and the only one. Doc 31 § 3 is explicit that the
 * per-sex pivot exists precisely so that this statement can be made without also asserting anything
 * about how she would compare to a male heavyweight, which is not a question the ratings answer.
 *
 * ## Two pivots here are weaker evidence than the rest
 *
 * Doc 31 § 8.4 marks the female **Speed** and **Durability** pivots as calibration-sensitive, and
 * they are the two least grounded numbers in the whole scale. There is good public force-plate and
 * sprint data for male athletes at these masses and very little for female combat athletes, and
 * essentially no concussion-threshold data at all. So the Speed and Durability sigmas in this file
 * are placements *relative to other women*, which is a claim the roster can support, and they should
 * be re-derived rather than trusted if either pivot moves. The Power, Cardio and Strength placements
 * are on firmer ground.
 *
 * ## The 4.3% that the body model will not house
 *
 * Reported here as context, not as a defect to be fixed in this step. Roughly one female body in
 * twenty-three sampled by `sampleBodyForDivision` ends up too large for `womens-featherweight`, the
 * heaviest women's division the promotion runs, and `chosenDivision` correctly returns `undefined`
 * rather than inventing a home for her. That is not a bug in the ladder: the women's ladder stops at
 * 145 lb while real women do not, and a generator that housed everybody would be claiming otherwise.
 * See `body-baseline.test.ts` for the measurement and doc 31 § 14 for what to do about it.
 *
 * ## What was deliberately not consulted
 *
 * The existing seed rosters' physical ratings, exactly as in `men.ts`.
 */

import type { CalibrationEntry } from './entry.js';

const WSW = 'womens-strawweight';
const WFLW = 'womens-flyweight';
const WBW = 'womens-bantamweight';
const WFW = 'womens-featherweight';

export const WOMEN_CALIBRATION: readonly CalibrationEntry[] = [
  // --- Featherweight (145) -----------------------------------------------------------------
  {
    id: 'cal_cyborg',
    name: 'Cris Cyborg',
    measured: { sex: 'female', division: WFW, heightInches: 68, reachInches: 68 },
    estimated: { walkingWeightLbs: 163, confidence: 'fair', bodyFatIndex: 36, waterCutIndex: 55 },
    placement: { power: 2.3, speed: 0.7, cardio: 1.0, durability: 1.7, strength: 1.5 },
    alsoFought: [WBW],
    defence: {
      power:
        'Force per strike over fifteen years, evidenced by opponents hurt while defending correctly. The top of the female Power ladder and the anchor the rest is placed against.',
    },
    notes:
      'The women’s Power ceiling anchor, and placed at +2.3 rather than higher for the same reason Ngannou sits at +2.4: leaving headroom is what keeps the top of the scale able to distinguish anybody. Durability +1.7 is the strongest evidence in the file — a fifteen-year career, almost all of it moving forward through return fire, with one stoppage loss. Speed +0.7 is deliberately much lower than her Power: she wins by walking people down, not by beating them to the punch, and the archetype error would be to read "physically dominant" as "fast". Cardio +1.0 rather than higher because her fights rarely required a fourth round.',
  },
  {
    id: 'cal_anderson',
    name: 'Megan Anderson',
    measured: { sex: 'female', division: WFW, heightInches: 72, reachInches: 70 },
    estimated: { walkingWeightLbs: 159, confidence: 'poor', bodyFatIndex: 49, waterCutIndex: 45 },
    placement: { power: 0.9, speed: -0.8, cardio: -1.1, durability: -0.7, strength: -0.4 },
    notes:
      'The tall-and-light-framed case for the women’s ladder: six foot at 145 lb is an extreme height for the division and produces a body carrying very little mass per inch. That combination is exactly what the ladder is supposed to price — the length buys her Power at +0.9 through leverage, and costs her everywhere the same frame has to be moved or fed. Speed −0.8 and Cardio −1.1 are both well attested; she faded visibly and was outworked by shorter, denser opponents. Strength −0.4 despite being the tallest woman on the roster, which is the point: height is not mass.',
  },
  {
    id: 'cal_spencer',
    name: 'Felicia Spencer',
    measured: { sex: 'female', division: WFW, heightInches: 68, reachInches: 68 },
    estimated: { walkingWeightLbs: 160, confidence: 'fair', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: -0.7, speed: -0.5, cardio: 1.0, durability: 1.9, strength: 0.3 },
    defence: {
      durability:
        "Impulse to concuss, on the single best piece of evidence in either file: twenty-five minutes of unanswered damage from the hardest hitter in women's MMA, still upright. Not defence, since almost none of it was defended, and taken at prime.",
    },
    notes:
      'The excellent-Durability anchor on the women’s side, and the cleanest single piece of evidence in this file for any attribute: twenty-five minutes of sustained, unanswered damage from the hardest hitter in the sport, still upright at the horn. Placed at +1.9 rather than +2.5 because absorbing that is evidence of a very high threshold, not an unbounded one. Everything else about her is at or below the division centre — Power −0.7, Speed −0.5 — which is the decorrelation this file needs: durability is not athleticism, and a fighter can be built almost entirely out of one of them.',
  },
  {
    id: 'cal_de_randamie',
    name: 'Germaine de Randamie',
    measured: { sex: 'female', division: WFW, heightInches: 69, reachInches: 71 },
    estimated: { walkingWeightLbs: 158, confidence: 'fair', bodyFatIndex: 44, waterCutIndex: 50 },
    placement: { power: 1.3, speed: 0.6, cardio: -0.5, durability: 0.4, strength: 0.2 },
    alsoFought: [WBW],
    notes:
      'The unusually long reach case for the women: 71" at 5’9" is a +2" ape index and the longest span in the women’s file. Power +1.3 is a genuine kickboxer’s record of stopping people, and it is the one attribute where the length actually shows up in the ladder. Cardio −0.5 is the interesting placement — a striker with a decorated kickboxing base whose five-round fights were nonetheless laboured, which is a reminder that a striking pedigree says nothing about work capacity. Strength +0.2 is near-centre and deliberately so: she was reliably taken down by people her own size.',
  },
  {
    id: 'cal_dumont',
    name: 'Norma Dumont',
    measured: { sex: 'female', division: WFW, heightInches: 67, reachInches: 67 },
    estimated: { walkingWeightLbs: 158, confidence: 'poor', bodyFatIndex: 53, waterCutIndex: 45 },
    placement: { power: 0.0, speed: -0.3, cardio: 0.5, durability: 0.4, strength: 0.2 },
    notes:
      'A deliberately ordinary featherweight, and the division needs one. All five placements sit inside 0.5σ because there is genuinely nothing exceptional to report: she wins decisions, she is hard to finish without being remarkable at it, and she has never looked either fast or slow for the class. Resisting the pull to make an entry interesting is the whole job of a case like this — a roster of only memorable athletes would misdescribe the population as badly as one with no outliers. Power 0.0, Speed −0.3, Cardio +0.5, Durability +0.4 and Strength +0.2 are all inside half a sigma of the division median, which is the entire entry.',
  },

  // --- Bantamweight (135) ------------------------------------------------------------------
  {
    id: 'cal_nunes',
    name: 'Amanda Nunes',
    measured: { sex: 'female', division: WBW, heightInches: 68, reachInches: 69 },
    estimated: { walkingWeightLbs: 151, confidence: 'fair', bodyFatIndex: 41, waterCutIndex: 55 },
    placement: { power: 2.2, speed: 1.1, cardio: -0.3, durability: 0.7, strength: 1.6 },
    alsoFought: [WFW],
    defence: {
      power:
        "Force at 135 and 145, evidenced by two of the sport's most durable strikers stopped inside a round each. Not accumulation and not accuracy, though both are good.",
      cardio:
        "Below the threshold at −0.3 and defended because it is the placement reputation would most likely have got wrong. The documented pattern is a devastating first ten minutes followed by a visible drop, and the Peña loss is that pattern ending a fight. Placing the division's most dominant champion below its median on an attribute is the kind of judgement this file exists to make, and it is a claim about work capacity rather than about pacing or about how good she is.",
    },
    notes:
      'The women’s Power anchor at bantamweight, placed from an unusually direct record: she stopped the two largest-reputation strikers in the sport inside a round each. Cardio −0.3 is the placement that matters most here and is the one reputation would have got wrong — her documented pattern is a devastating first ten minutes followed by a visible drop, and the Peña loss is that pattern ending a fight. Placing her below the division median for Cardio while she is +2.2 for Power is precisely the independence this file is meant to demonstrate. Strength +1.6 from clinch and top control against bigger women; Speed +1.1 for real but not exceptional hand speed.',
  },
  {
    id: 'cal_holm',
    name: 'Holly Holm',
    measured: { sex: 'female', division: WBW, heightInches: 68, reachInches: 68 },
    estimated: { walkingWeightLbs: 149, confidence: 'fair', bodyFatIndex: 44, waterCutIndex: 50 },
    placement: { power: -0.9, speed: 1.0, cardio: 1.8, durability: 0.6, strength: -0.4 },
    defence: {
      cardio:
        'Championship-distance capacity from a professional boxing and distance-running base, holding output to the final round. Style-independent — it is the same whether she is leading or chasing.',
    },
    notes:
      'The clearest anti-archetype entry in either file. One iconic head kick has given her a reputation for power that her record does not support — a long career of decisions won on points, at Power −0.9. Cardio +1.8 is the real outlier and is very well evidenced: a professional boxing career at championship distance, an endurance-running base, and five-round fights she finishes strongly. Speed +1.0 and Strength −0.4 pull in opposite directions, which is what a rangy out-fighter who gets held against the fence actually looks like.',
  },
  {
    id: 'cal_rousey',
    name: 'Ronda Rousey',
    measured: { sex: 'female', division: WBW, heightInches: 67, reachInches: 68 },
    estimated: { walkingWeightLbs: 150, confidence: 'fair', bodyFatIndex: 43, waterCutIndex: 50 },
    placement: { power: 0.5, speed: 0.9, cardio: -0.4, durability: -1.6, strength: 1.8 },
    defence: {
      strength:
        'Olympic judo throwing force against women who could not be thrown by anyone else, including opponents who defended the grip correctly. Technique is separately elite and rated in the technical attributes.',
      durability:
        "Below the 1.8 threshold at −1.6 and defended anyway, because it is the placement in the file most exposed to the confound. It rests on two knockout losses to strikes that other bantamweights here demonstrably absorb — direct evidence about impulse to concuss, which is more than most Durability placements can claim. It is not read off career decline: both came while she was champion or immediately after, in a short career with little accumulated damage, so the game's own damage system is not being double-counted.",
    },
    notes:
      'The suspect-Durability anchor, and the placement rests on the right kind of evidence for once: two separate knockout losses in which she was concussed by strikes that other bantamweights in this file demonstrably absorb. That is direct evidence about impulse-to-concuss rather than an inference from something else, which is more than most Durability placements in either file can claim. Strength +1.8 from an Olympic judo medal and a career of throwing people who would not be thrown by anybody else — the two placements are three and a half sigma apart on the same fighter, which is the point. Power +0.5 is ordinary for the division, Speed +0.9 is a genuine positive from an athletic base, and Cardio −0.4 is the honest reading of fights that were over in a minute and of the one that was not.',
  },
  {
    id: 'cal_pena',
    name: 'Julianna Peña',
    measured: { sex: 'female', division: WBW, heightInches: 66, reachInches: 68 },
    estimated: { walkingWeightLbs: 149, confidence: 'poor', bodyFatIndex: 51, waterCutIndex: 50 },
    placement: { power: -0.2, speed: -0.6, cardio: 1.3, durability: 1.5, strength: 0.4 },
    notes:
      'The slow-for-the-class case at bantamweight. Speed −0.6 is visible in every fight she has had — she is beaten to the punch consistently and by a wide margin — and the file needs fighters who are genuinely below the divisional centre on something, or the ladder is only ever calibrated upwards. Durability +1.5 and Cardio +1.3 are what she wins with: she takes the exchange she loses and is still there in round five. Power −0.2 is honest; her finishes are submissions off pressure, not strikes.',
  },
  {
    id: 'cal_tate',
    name: 'Miesha Tate',
    measured: { sex: 'female', division: WBW, heightInches: 66, reachInches: 66 },
    estimated: { walkingWeightLbs: 148, confidence: 'fair', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: -0.4, speed: -0.1, cardio: 1.1, durability: 1.2, strength: 0.5 },
    notes:
      'An ordinary athlete with two above-average attributes, which describes a very large share of the actual sport. Nothing about her striking, hand speed or raw strength stands out at 135 lb; her Cardio and her willingness to be hit for four rounds and win the fifth do. Placed with four of five inside 1.2σ on purpose.',
  },
  {
    id: 'cal_pennington',
    name: 'Raquel Pennington',
    measured: { sex: 'female', division: WBW, heightInches: 67, reachInches: 68 },
    estimated: { walkingWeightLbs: 150, confidence: 'poor', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: 0.1, speed: -0.2, cardio: 0.9, durability: 0.8, strength: 0.3 },
    notes:
      'All five placements inside 1σ — a divisional champion who is, physically, an entirely median bantamweight. That combination is worth stating explicitly because it is the strongest available argument that these ratings are not a proxy for how good somebody is: the ladder describes the body, and a career is built on top of it out of other things. Power +0.1, Speed −0.2, Cardio +0.9, Durability +0.8 and Strength +0.3 are all inside a sigma of the bantamweight median.',
  },
  {
    id: 'cal_harrison',
    name: 'Kayla Harrison',
    measured: { sex: 'female', division: WBW, heightInches: 68, reachInches: 71 },
    estimated: { walkingWeightLbs: 172, confidence: 'good', bodyFatIndex: 37, waterCutIndex: 85 },
    placement: { power: 1.4, speed: 0.2, cardio: 0.6, durability: 0.5, strength: 2.1 },
    defence: {
      strength:
        "Two Olympic judo golds and a history of physically overwhelming women at and above her weight. The clearest strength-not-technique case in the women's file, because she overpowers people who defend correctly.",
    },
    notes:
      'The women’s exceptional-Strength anchor — two Olympic judo golds, and a competitive history of physically overwhelming women her own size and larger — and simultaneously the largest weight cut in either file. Strength +2.1 with Speed +0.2 is the pairing that matters: she is not quick, she is strong, and the file would be misdescribing her if a high Strength dragged the rest up with it. Her walking weight is a `good` estimate by the standards of this column because the cut was itself the story of her move to 135 and was reported on at length. She also competed at 155 lb outside the promotion, which is above the heaviest women’s division the game models, so it cannot be recorded in `alsoFought`. Power +1.4 is genuine and comes from mass rather than technique, Cardio +0.6 is a mild positive, and Durability +0.5 is ordinary for the division.',
    disagreement: {
      kind: 'historicalExtremeCut',
      note: 'The body model will not house her at bantamweight, and it is right to object. Cutting from a walking weight in the low 170s to 135 is at or past the edge of what the sport should permit, was widely described as dangerous at the time, and is exactly the case doc 31 § 12 step 5 means by a cut that really happened and should not have. The entry is left as authored rather than trimmed to a weight the model likes, because normalising it away would delete the only real datapoint the model has about its own upper bound.',
    },
  },

  // --- Flyweight (125) ---------------------------------------------------------------------
  {
    id: 'cal_shevchenko',
    name: 'Valentina Shevchenko',
    measured: { sex: 'female', division: WFLW, heightInches: 65, reachInches: 67 },
    estimated: { walkingWeightLbs: 140, confidence: 'fair', bodyFatIndex: 39, waterCutIndex: 55 },
    placement: { power: 0.8, speed: 1.3, cardio: 1.6, durability: 1.5, strength: 0.9 },
    alsoFought: [WBW],
    notes:
      'The one entry in this file where all five sit above the divisional median, and it is deliberate: a roster with no genuine all-round outlier would misdescribe the sport as much as one made entirely of them. What keeps it from being an archetype is the spread — +0.8 to +1.6 is nearly a full sigma of internal variation, and the ordering is not the one reputation would produce. Her Power is the *lowest* of the five despite a highlight reel, because her finishes come from timing and placement rather than force; her Cardio is the highest, and five-round title fights at a constant work rate are the evidence. She is also a cross-division mover, which makes her one of the more valuable entries for step 7. Speed +1.3 is real, Durability +1.5 is a chin nobody at flyweight has found, and Strength +0.9 is the lowest of the five alongside Power, because she wins clinch exchanges on technique rather than on force.',
  },
  {
    id: 'cal_chookagian',
    name: 'Katlyn Chookagian',
    measured: { sex: 'female', division: WFLW, heightInches: 69, reachInches: 68 },
    estimated: { walkingWeightLbs: 138, confidence: 'fair', bodyFatIndex: 53, waterCutIndex: 45 },
    placement: { power: -1.2, speed: 0.3, cardio: 1.4, durability: 0.8, strength: -0.9 },
    notes:
      'Tall and light-framed at flyweight, and the women’s low-Power case. Five foot nine at 125 lb is three and a half inches over the divisional norm carried on very little mass, and the ladder should price that as it does: Power −1.2 and Strength −0.9, both well below the median, against a long career in which she has almost never stopped anybody and is routinely held and controlled by shorter opponents. Cardio +1.4 is what she has instead — volume for fifteen or twenty-five minutes without a drop. Durability +0.8 for a long career at the top of the division without being finished by strikes.',
  },
  {
    id: 'cal_fiorot',
    name: 'Manon Fiorot',
    measured: { sex: 'female', division: WFLW, heightInches: 66, reachInches: 66 },
    estimated: { walkingWeightLbs: 140, confidence: 'poor', bodyFatIndex: 43, waterCutIndex: 50 },
    placement: { power: 1.2, speed: 0.5, cardio: 0.7, durability: 0.6, strength: 1.1 },
    notes:
      'Above the divisional centre on everything but not dramatically so on anything, which is the most common shape of a good fighter and is under-represented if a file only contains anchors and median cases. Power +1.2 and Strength +1.1 are the two that stand out on tape — she visibly moves flyweights around — and Speed +0.5 is the corrective: she is not quick, she is heavy-handed, and those are different claims.',
  },
  {
    id: 'cal_grasso',
    name: 'Alexa Grasso',
    measured: { sex: 'female', division: WFLW, heightInches: 65, reachInches: 65 },
    estimated: { walkingWeightLbs: 138, confidence: 'fair', bodyFatIndex: 47, waterCutIndex: 50 },
    placement: { power: 0.1, speed: 0.9, cardio: 0.4, durability: 0.3, strength: -0.5 },
    notes:
      'A boxer’s profile: Speed +0.9 for genuinely quick, accurate hands, and everything else at or slightly below the divisional centre. Strength −0.5 is not a slight — she is out-wrestled by the stronger flyweights and has to fight to stay standing, which is a physical fact about her and not a hole in her game. Power +0.1 because her stoppages come from accumulation and one submission, not from force.',
  },
  {
    id: 'cal_blanchfield',
    name: 'Erin Blanchfield',
    measured: { sex: 'female', division: WFLW, heightInches: 64, reachInches: 65 },
    estimated: { walkingWeightLbs: 139, confidence: 'poor', bodyFatIndex: 45, waterCutIndex: 55 },
    placement: { power: -0.3, speed: 0.2, cardio: 0.8, durability: 0.4, strength: 1.0 },
    notes:
      'Strong for the division and unremarkable everywhere else — a grappler who wins by taking bigger flyweights down and holding them there, with Strength +1.0 the only placement outside 0.8σ. Power −0.3 is honest about a striking record with no knockouts in it. Speed +0.2 and Durability +0.4 are both ordinary for flyweight, and Cardio +0.8 is a mild positive that supports the grappling volume.',
  },
  {
    id: 'cal_maia_j',
    name: 'Jennifer Maia',
    measured: { sex: 'female', division: WFLW, heightInches: 65, reachInches: 66 },
    estimated: { walkingWeightLbs: 138, confidence: 'poor', bodyFatIndex: 51, waterCutIndex: 50 },
    placement: { power: 0.3, speed: -0.2, cardio: 0.4, durability: 0.6, strength: 0.1 },
    notes:
      'Deliberately ordinary. A long-tenured flyweight whose physicals give the division its centre of mass: nothing here is more than 0.6σ from the median, and the division needs at least two entries like this one to stop the percentile tables being read off a set of outliers. Power +0.3, Speed −0.2, Cardio +0.4, Durability +0.6 and Strength +0.1 are all within two thirds of a sigma of the division median.',
  },

  // --- Strawweight (115) -------------------------------------------------------------------
  {
    id: 'cal_zhang',
    name: 'Zhang Weili',
    measured: { sex: 'female', division: WSW, heightInches: 64, reachInches: 63 },
    estimated: { walkingWeightLbs: 133, confidence: 'fair', bodyFatIndex: 34, waterCutIndex: 75 },
    placement: { power: 1.8, speed: 1.0, cardio: 0.6, durability: 0.5, strength: 1.6 },
    defence: {
      power:
        'Force at 115 against opponents nobody else in the division hurts, delivered on counters rather than accumulated. Visible physique supports it and the estimate says so.',
    },
    notes:
      'The strawweight Power and Strength case, and the one place in the women’s file where a visible physique is doing real work in the estimate: an unusually low body-fat index and a lot of lean mass on a 5’4" frame. Power +1.8 from a record of hurting people the rest of the division cannot hurt. Durability +0.5 rather than higher is the placement that matters — she survived two of the hardest fights in the division’s history and was also knocked out in seventy-eight seconds, and both of those are real. Filling in a high chin from her toughness reputation would be exactly the error `men.ts` warns about.',
    disagreement: {
      kind: 'cutModelTooStrict',
      note: "A 13.4% cut, called impossible for a fighter who has made 115 lb for her entire career. Four of the nine strawweights in this file are rejected at cuts between 13.4% and 18.5%, which is not four separate authoring errors — it is a pattern, and it points at the female composition constants. A fatFloor of 0.15 and a 13% camp body fat leave a female body far less water to shed than the male equivalent, so the women's floor sits proportionally higher than the men's and the lightest women's division is the first place that shows.",
      resolution:
        'Resolved by doc 31 section 14.6, and the reasoning in the original note was wrong even though the finding was right. Four of nine strawweights being rejected was a real pattern, but not because the female composition constants are harsher: at their respective leanest a woman can lose 11.1% of her walking weight and a man 10.0%, so the female side was never the stricter one. The pattern is the division ladder. Strawweight asks a mean cut of 12.3% where every other division asks 8.5 to 11.4%, so it was simply the first place a ceiling that was too low for everybody showed up. She now reads severe.',
    },
  },
  {
    id: 'cal_jedrzejczyk',
    name: 'Joanna Jędrzejczyk',
    measured: { sex: 'female', division: WSW, heightInches: 66, reachInches: 65 },
    estimated: { walkingWeightLbs: 136, confidence: 'good', bodyFatIndex: 41, waterCutIndex: 80 },
    placement: { power: 0.2, speed: 1.3, cardio: 2.0, durability: 0.3, strength: -0.4 },
    defence: {
      cardio:
        'Five-round volume at a rate the division could not match, repeatedly, in fights she was not comfortably winning. Capacity rather than pace choice.',
    },
    notes:
      'The women’s exceptional-Cardio anchor at +2.0, and the evidence is as good as this file gets: a title reign built on maintaining a volume nobody in the division could match for five rounds, repeatedly, against opponents who were still fresh enough to be dangerous. Power +0.2 alongside it is the crucial pairing — she is a volume striker with three knockouts in a long career, and Cardio and Power are separate attributes that the archetype instinct wants to fuse. Strength −0.4 because the stronger strawweights consistently put her on the fence and against the mat. Her cut to 115 was severe and well documented, which is why the walking-weight estimate is the rare `good` one.',
    disagreement: {
      kind: 'historicalExtremeCut',
      note: 'A 15.4% cut, rejected. Hers was genuinely severe and is widely blamed for the second half of her career, so a verdict of extreme would be the right one. notViable is not: she made the weight for a title reign that lasted years. The distinction is the whole point — the model needs to be able to say that a cut is dangerous without saying it is impossible, and at strawweight it currently cannot.',
      resolution:
        'Resolved by doc 31 section 14.6 and refiled from cutModelTooStrict. The model can now say what her cut actually was: severe at 15.4%, viable but with only a couple of pounds of headroom, which matches a title reign that was made at a cost widely blamed for the second half of her career. The distinction the original note asked for — dangerous without being impossible — is the one the three-pool model exists to draw.',
    },
  },
  {
    id: 'cal_namajunas',
    name: 'Rose Namajunas',
    measured: { sex: 'female', division: WSW, heightInches: 65, reachInches: 65 },
    estimated: { walkingWeightLbs: 126, confidence: 'fair', bodyFatIndex: 47, waterCutIndex: 60 },
    placement: { power: 1.1, speed: 1.2, cardio: 0.3, durability: -0.3, strength: -0.6 },
    alsoFought: [WFLW],
    notes:
      'The close-to-walking-weight case: a strawweight who competes near her natural size rather than arriving from above it, which the model should be able to represent as a distinct kind of body from Zhang or Andrade at the same limit. Power +1.1 is genuine and slightly surprising given how light she is — two stoppages of Jędrzejczyk and a head-kick knockout — which is what the ladder’s leverage and technique headroom is for. Strength −0.6 and Durability −0.3 are the price of the same lightness; she is moved around in the clinch and she has been dropped.',
  },
  {
    id: 'cal_andrade',
    name: 'Jessica Andrade',
    measured: { sex: 'female', division: WSW, heightInches: 61, reachInches: 62 },
    estimated: { walkingWeightLbs: 136, confidence: 'good', bodyFatIndex: 37, waterCutIndex: 85 },
    placement: { power: 2.0, speed: 0.4, cardio: 1.2, durability: 1.3, strength: 1.9 },
    alsoFought: [WFLW, WBW],
    defence: {
      power:
        "Force from an extremely dense 5 foot 1 body, delivered without setup. The roster's clearest case of power coming from mass rather than from technique, which is exactly why she is in the file.",
      strength:
        'Clinch and slam force against women two divisions up. Mass and lean tissue rather than grappling skill, which is ordinary.',
    },
    notes:
      'Short, extremely thick, and the largest cut at strawweight in this file — five foot one carrying a bantamweight’s lean mass down to 115. Four of her five placements are high and that is not archetype-filling; it is what a body built like this actually is, and the one that is not — Speed +0.4 — is the tell. She is not quick, she is dense, and the file would be lying if it made her fast because it had made her strong. The most valuable cross-division mover in the women’s roster: she has competed at 115, 125 and 135 with the same body, which is the controlled comparison step 7 needs and which no pair of different fighters can provide. Power +2.0 is the highest at strawweight and comes from lean mass rather than from technique, Cardio +1.2 supports a relentless pace, Durability +1.3 is a long career of taking shots to give them, and Strength +1.9 is the same mass again.',
    disagreement: {
      kind: 'outsideBodyModelRange',
      note: 'Reconstructs 6 lb light against the female coefficient ceiling of 13.0. Five foot one carrying a bantamweight lean mass is the female counterpart of the Mark Hunt problem and hits the same wall for the same reason. Her Power and Strength placements are the roster low-height anchors, so the shortfall matters more here than the six pounds suggests: it is exactly the dimension she was included to calibrate.',
      resolution:
        'Resolved by doc 31 section 18, and this entry is the reason the index scale changed rather than the estimate. At 5 foot 1 and 136 lb she implies a fat-free mass index of 21.1 against a female limit of 23 — an ordinary, buildable body — and the model still could not express her, because the old scale ceiling was a constant in lean-kg-per-cubic-metre and therefore a different human limit at every height. Hers was 20.1. She was the only plausible body in the roster the scale could not hold, and she is what sized the correction.',
    },
  },
  {
    id: 'cal_esparza',
    name: 'Carla Esparza',
    measured: { sex: 'female', division: WSW, heightInches: 61, reachInches: 63 },
    estimated: { walkingWeightLbs: 130, confidence: 'fair', bodyFatIndex: 47, waterCutIndex: 65 },
    placement: { power: -0.8, speed: -0.4, cardio: 0.7, durability: 0.9, strength: 1.5 },
    notes:
      'Short and thick like Andrade and almost her physical opposite everywhere except Strength, which is why both belong in the file. A decade-long career at the top of the division with essentially no stopping power — Power −0.8 — built entirely on getting inside, taking people down and holding them there, at Strength +1.5. Speed −0.4 is consistent with being hit on the way in for ten years. This is the shape the ladder should produce for a wrestler, and it is not the shape it produces for a puncher.',
  },
  {
    id: 'cal_suarez',
    name: 'Tatiana Suarez',
    measured: { sex: 'female', division: WSW, heightInches: 64, reachInches: 64 },
    estimated: { walkingWeightLbs: 134, confidence: 'poor', bodyFatIndex: 39, waterCutIndex: 70 },
    placement: { power: 0.3, speed: 0.1, cardio: 0.4, durability: 0.1, strength: 2.0 },
    defence: {
      strength:
        'Clinch and takedown control force at 115 lb against women who are not controlled by anyone else, including opponents who defend the entry correctly. Separable from her wrestling technique, which is also excellent: the tell is that she moves people who have already stopped the shot. Her injury history says nothing here — that is structural robustness, a different question from either strength or the impulse required to concuss her, and doc 31 section 14 owns the split.',
    },
    notes:
      'The strawweight Strength ceiling at +2.0: she physically controls women who cannot be controlled by anyone else in the division, and it is the single most-remarked-on thing about her. Durability +0.1 is the deliberate placement and worth explaining, because reputation would push it down hard. Her career has been repeatedly interrupted by neck and knee injuries, and it is tempting to read that as fragility — but doc 31 § 3 defines Durability as the impulse required to concuss, which is a different physiological question from whether a joint or a disc holds up. There is essentially no evidence about her chin, so the placement sits at the divisional centre rather than being filled in from the wrong kind of evidence. This is the case that the deferred constitution split (doc 31 § 14) exists to serve. Power +0.3, Speed +0.1 and Cardio +0.4 are all within half a sigma of the strawweight median, which makes the entry a single enormous positive on an otherwise average athlete.',
    disagreement: {
      kind: 'cutModelTooStrict',
      note: "A 14.2% cut, rejected. The same female-composition pattern as Zhang and Jędrzejczyk, and kept rather than trimmed because three independent cases at three different cut sizes are much better evidence about the model than any one of them would be alone. She is also an unusually lean and muscular strawweight, which is the same double penalty that rejects Pereira and Romero on the men's side; the two mechanisms compound here.",
      resolution:
        'Resolved by doc 31 section 14.6. Now severe at 14.2%. The compounding this note claimed between the female constants and her leanness was half wrong: leanness does raise the floor, but the female constants are not stricter than the male ones, and the shared cause was the undifferentiated fight-week pool. Her walking weight is the poorest-sourced number of the four strawweights, so she was never the case to reason from.',
    },
  },
  {
    id: 'cal_waterson',
    name: 'Michelle Waterson',
    measured: { sex: 'female', division: WSW, heightInches: 63, reachInches: 63 },
    estimated: { walkingWeightLbs: 124, confidence: 'fair', bodyFatIndex: 50, waterCutIndex: 50 },
    placement: { power: -1.5, speed: 0.8, cardio: 0.2, durability: -0.9, strength: -1.5 },
    notes:
      'The weak-for-the-division technician, and the women’s low anchor for both Power and Strength. She is small even for strawweight and competes barely above her walking weight while the rest of the top ten arrives from 130 or above, and that shows up on tape exactly as the ladder says it should: she is out-muscled in the clinch by everybody, and she has almost never hurt anyone. Speed +0.8 is real and is what she fights with. Durability −0.9 is the honest reading of a career in which she has been stopped by strikes more than once. A division where nobody sits at −1.5 has a truncated distribution and will produce nonsense percentiles.',
  },
  {
    id: 'cal_dern',
    name: 'Mackenzie Dern',
    measured: { sex: 'female', division: WSW, heightInches: 64, reachInches: 63 },
    estimated: { walkingWeightLbs: 141, confidence: 'good', bodyFatIndex: 53, waterCutIndex: 70 },
    placement: { power: -0.2, speed: -0.5, cardio: -0.6, durability: 0.4, strength: 0.2 },
    notes:
      'A physically unremarkable athlete with a world-class skill, which is a combination the roster must contain or the ladder will be quietly read as a talent scale. Every placement here is inside 0.6σ; she is a black-belt grappler and that is a fact about her skills, not about her body. Cardio −0.6 and Speed −0.5 are visible in her stand-up. She is also the file’s clearest weight-management case, which is why the walking-weight estimate is `good`: her struggles making 115 have been public and repeated. Power −0.2, Durability +0.4 and Strength +0.2 are all near the division median, completing a set of five placements none of which is remarkable.',
    disagreement: {
      kind: 'historicalExtremeCut',
      note: 'If the body model rejects her at strawweight, the first suspect is this file rather than the model. A walking weight in the low 140s down to 115 is a very large cut, and it is inferred from fight-week reporting and visible missed weights rather than measured. She did in fact compete at strawweight for years, so either she walked lighter than estimated between camps or the composition inference is putting too much of her mass in the lean column.',
      resolution:
        'Resolved by doc 31 section 14.6 and refiled. She now reads extreme at 18.5%, viable by under half a pound — the tightest margin in the file, and the right place for her. Refiled from walkingWeightEstimate because the correction did not come from revisiting her walking weight: that estimate is still the least certain in the file and is deliberately left alone, so this entry remains a soft falsifier rather than a hard one. If the model is ever wrong about her, the first suspect is still this file.',
    },
  },
  {
    id: 'cal_rodriguez_m',
    name: 'Marina Rodriguez',
    measured: { sex: 'female', division: WSW, heightInches: 65, reachInches: 66 },
    estimated: { walkingWeightLbs: 131, confidence: 'poor', bodyFatIndex: 49, waterCutIndex: 55 },
    placement: { power: 0.4, speed: 0.5, cardio: 0.6, durability: 0.2, strength: -0.3 },
    notes:
      'Deliberately ordinary, and the strawweight companion to Jennifer Maia. Nothing outside 0.6σ in either direction. A long career against top opposition without ever being described as fast, strong, powerful or gassed, which is the most honest evidence there is for a set of median placements. Speed +0.5, Cardio +0.6, Durability +0.2 and Strength −0.3 are all inside two thirds of a sigma of the strawweight median.',
  },
];
