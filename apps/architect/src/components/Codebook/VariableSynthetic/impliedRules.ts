import {
  collectInterfaceImpliedRules,
  type InterfaceImpliedRules,
  syntheticSubjectKey,
  type EffectiveVariableRules,
} from '@codaco/protocol-validation';
import { stagesImplying } from '~/components/Synthetic/impliedRuleSources';

/**
 * What the protocol's own interfaces impose on a codebook variable, and which
 * stage imposes it.
 *
 * Both come from `collectInterfaceImpliedRules`, the schema's single
 * definition of them (spec governing rule 1): the rules it collects, and the
 * per-stage sources it collects them FROM. The editor never has to know which
 * interfaces impose what — the knowledge the schema owns — and the rule it
 * applies and the stage it names come from one walk rather than two.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Everything one variable's editor needs to know about its implied rules. */
export type VariableImpliedRules = {
  /** The rules themselves, as the schema collects them for the whole protocol. */
  rules: EffectiveVariableRules;
  /**
   * Whether the protocol assigns this variable only through a binning prompt,
   * in which case the interview enforces none of its declared validation.
   */
  binOnly: boolean;
  /** Stages whose own rules make every value of this variable answered. */
  alwaysAnsweredBy: string[];
  /** Stages whose own rules fix how many options this variable receives. */
  selectionPinnedBy: string[];
};

export const NO_IMPLIED_RULES: VariableImpliedRules = {
  rules: {},
  binOnly: false,
  alwaysAnsweredBy: [],
  selectionPinnedBy: [],
};

/**
 * One walk of the whole protocol, held so many variables can be answered from
 * it.
 *
 * `collectInterfaceImpliedRules` walks every stage and every reference in the
 * document, which is the right cost to pay ONCE for a surface asking about one
 * variable and the wrong cost to pay per row: the Codebook's synthetic list
 * renders a row per attribute, so asking each of them separately re-walked the
 * protocol as many times as the type has attributes, on every render, and every
 * synthetic edit did it again. Hoist this above the list and read each variable
 * out of it with {@link impliedRulesIn}.
 */
export type CollectedImpliedRules = {
  rules: InterfaceImpliedRules;
  stages: unknown[];
} | null;

export const collectImpliedRules = (
  protocol: unknown,
): CollectedImpliedRules =>
  isRecord(protocol)
    ? {
        rules: collectInterfaceImpliedRules(protocol),
        stages: Array.isArray(protocol.stages) ? protocol.stages : [],
      }
    : null;

/**
 * One variable's implied rules, read out of a walk that has already happened.
 *
 * `variableId` is the codebook key rather than the name, which is how every
 * writer in the protocol references it.
 */
export const impliedRulesIn = (
  collected: CollectedImpliedRules,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string | undefined },
  variableId: string | undefined,
): VariableImpliedRules => {
  if (collected === null || variableId === undefined) return NO_IMPLIED_RULES;

  const key = syntheticSubjectKey(subject);
  const { rules: walked, stages } = collected;
  const rules = walked.get(key)?.get(variableId) ?? {};
  const binOnly = walked.binOnlyVariables.get(key)?.has(variableId) === true;
  const sources = walked.impliedRuleSources.get(key)?.get(variableId) ?? [];

  return {
    rules,
    binOnly,
    alwaysAnsweredBy: stagesImplying(
      sources,
      stages,
      (stageRules) => stageRules.required === true,
    ),
    selectionPinnedBy: stagesImplying(
      sources,
      stages,
      (stageRules) => stageRules.maxSelected !== undefined,
    ),
  };
};

/**
 * The implied rules for one variable of one subject, walk included — for a
 * surface asking about exactly one. A surface asking about many pairs
 * {@link collectImpliedRules} with {@link impliedRulesIn} instead.
 */
export const variableImpliedRules = (
  protocol: unknown,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string | undefined },
  variableId: string | undefined,
): VariableImpliedRules =>
  impliedRulesIn(collectImpliedRules(protocol), subject, variableId);

// ---------------------------------------------------------------------------
// The sentences a disabled control shows
// ---------------------------------------------------------------------------

/**
 * Why missingness cannot be authored on this variable, or `undefined` where it
 * can be.
 *
 * Whole sentences rather than assembled fragments, so each one can be
 * localised as written; the only interpolation is the stage's own label, which
 * is researcher-authored data rather than copy.
 */
export const missingProbabilityDisabledReason = (
  required: boolean,
  alwaysAnsweredBy: readonly string[],
): string | undefined => {
  if (!required) return undefined;
  const [only, ...rest] = alwaysAnsweredBy;
  if (only !== undefined && rest.length === 0) {
    return `Always answered — ‘${only}’ cannot leave this attribute blank, so it is never missing.`;
  }
  if (only !== undefined) {
    return 'Always answered — the stages that collect this attribute cannot leave it blank, so it is never missing.';
  }
  return 'Always answered — this attribute is required, so it is never missing.';
};

/**
 * Why the number of selections cannot be authored, or `undefined` where it
 * can be.
 *
 * `soleCount` is the one number of selections the effective rules leave
 * reachable — computed by asking the schema which counts it accepts, never by
 * restating the rule that narrowed them.
 */
export const selectionCountDisabledReason = (
  soleCount: number | undefined,
  selectionPinnedBy: readonly string[],
): string | undefined => {
  if (soleCount === undefined) return undefined;
  const single = soleCount === 1;
  const [only, ...rest] = selectionPinnedBy;
  if (only !== undefined && rest.length === 0) {
    return single
      ? `Single choice — ‘${only}’ assigns exactly one option, so the number of selections cannot vary.`
      : `Fixed selection — ‘${only}’ always assigns the same number of options, so the number of selections cannot vary.`;
  }
  if (only !== undefined) {
    return single
      ? 'Single choice — the stages that collect this attribute assign exactly one option, so the number of selections cannot vary.'
      : 'Fixed selection — the stages that collect this attribute always assign the same number of options, so the number of selections cannot vary.';
  }
  return single
    ? 'Single choice — this attribute’s own rules allow exactly one option to be selected, so the number of selections cannot vary.'
    : 'Fixed selection — this attribute’s own rules leave only one possible number of selections.';
};
