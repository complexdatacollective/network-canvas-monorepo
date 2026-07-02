import type { BiologicalSex } from '@codaco/shared-consts';

/**
 * Which people provided each gamete (and who carried) for a child, identified by
 * the option value used in the bio-triad step (e.g. `'ego'`/`'partner'` or a
 * node id). `undefined` means "not determined — leave blank for the participant
 * to choose (e.g. a donor)".
 */
type GametePreselection = {
  eggSource?: string;
  spermSource?: string;
  carrier?: string;
  eggParentCarried?: boolean;
};

type Candidate = { value: string; sex: BiologicalSex | undefined };

/**
 * Pre-select who provided each gamete for a child of two prospective parents,
 * from their biological sex. Advisory only — the result is always overridable in
 * the UI, and it defers to `fallback` (today's positional default) whenever the
 * sexes cannot resolve an unambiguous assignment (either sex not `female`/`male`,
 * or both the same). Same-sex couples get the determinable side pre-selected and
 * the donor side left blank; two male parents additionally default to "someone
 * else carried the pregnancy" (a gestational carrier is required).
 */
export function inferGameteProviders(
  a: Candidate,
  b: Candidate,
  fallback: GametePreselection,
): GametePreselection {
  // Female + Male: unambiguous — the female provided the egg, the male the sperm.
  if (a.sex === 'female' && b.sex === 'male') {
    return {
      eggSource: a.value,
      spermSource: b.value,
      eggParentCarried: true,
    };
  }
  if (a.sex === 'male' && b.sex === 'female') {
    return {
      eggSource: b.value,
      spermSource: a.value,
      eggParentCarried: true,
    };
  }
  // Two female parents: one provided the egg; the sperm came from a donor, which
  // the participant selects (left blank).
  if (a.sex === 'female' && b.sex === 'female') {
    return {
      eggSource: a.value,
      spermSource: undefined,
      eggParentCarried: true,
    };
  }
  // Two male parents: one provided the sperm; the egg came from a donor and a
  // separate person carried the pregnancy (egg parent did not carry).
  if (a.sex === 'male' && b.sex === 'male') {
    return {
      eggSource: undefined,
      spermSource: a.value,
      carrier: undefined,
      eggParentCarried: false,
    };
  }
  // Any unknown / intersex / prefer-not-to-say sex: cannot infer confidently, so
  // keep the caller's positional default (today's behaviour).
  return fallback;
}
