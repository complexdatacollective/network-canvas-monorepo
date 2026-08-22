import {
  collectInterfaceImpliedRules,
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
 * The implied rules for one variable of one subject, with the stages that
 * imply them.
 *
 * `variableId` is the codebook key rather than the name, which is how every
 * writer in the protocol references it.
 */
export const variableImpliedRules = (
  protocol: unknown,
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string | undefined },
  variableId: string | undefined,
): VariableImpliedRules => {
  if (!isRecord(protocol) || variableId === undefined) return NO_IMPLIED_RULES;

  const key = syntheticSubjectKey(subject);
  const collected = collectInterfaceImpliedRules(protocol);
  const rules = collected.get(key)?.get(variableId) ?? {};
  const binOnly = collected.binOnlyVariables.get(key)?.has(variableId) === true;

  const stages = Array.isArray(protocol.stages) ? protocol.stages : [];
  const sources = collected.impliedRuleSources.get(key)?.get(variableId) ?? [];

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
