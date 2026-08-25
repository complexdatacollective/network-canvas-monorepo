import type {
  EffectiveVariableRules,
  ImpliedRuleSource,
} from '@codaco/protocol-validation';

/**
 * Naming the stages behind an interface-implied rule.
 *
 * `collectInterfaceImpliedRules` reports WHICH stage implies each rule, by
 * index; the two surfaces that tell a researcher about it — the codebook's
 * variable editor and the synthetic overview's attribute table — both need the
 * same answer to "which stages, named, imply this one rule". Shared so a note
 * on one screen and a disabled control's explanation on the other cannot name
 * different stages for the same rule.
 *
 * Neither surface decides which interfaces impose what; that stays with the
 * schema. What lives here is only how a stage is NAMED and how a source list
 * is filtered down to one rule.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fallback for a draft stage the researcher has not named yet. */
const UNNAMED_STAGE = 'this stage';

/**
 * The stage label a researcher would recognise, however sparse the stage.
 *
 * The codebook editor reads a MID-EDIT draft, where a stage being added may
 * have no label yet — and a raw index or an empty pair of quotation marks in
 * "‘’ cannot leave this attribute blank" is worse than saying nothing about
 * which stage it was.
 */
const impliedRuleStageLabel = (stage: unknown): string => {
  if (isRecord(stage)) {
    if (typeof stage.label === 'string' && stage.label.trim() !== '') {
      return stage.label;
    }
    if (typeof stage.type === 'string') return stage.type;
  }
  return UNNAMED_STAGE;
};

/**
 * The stages whose own contribution satisfies `implies`, named, in the order
 * the collector reports them (timeline order) and without repeats — two stages
 * a researcher gave the same name to are one name in a sentence.
 */
export const stagesImplying = (
  sources: readonly ImpliedRuleSource[],
  stages: readonly unknown[],
  implies: (rules: EffectiveVariableRules) => boolean,
): string[] => [
  ...new Set(
    sources
      .filter((source) => implies(source.rules))
      .map((source) => impliedRuleStageLabel(stages[source.stageIndex])),
  ),
];
