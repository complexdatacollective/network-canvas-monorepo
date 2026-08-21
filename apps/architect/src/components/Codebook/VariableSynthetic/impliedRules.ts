import {
  collectInterfaceImpliedRules,
  syntheticSubjectKey,
  type EffectiveVariableRules,
} from '@codaco/protocol-validation';

/**
 * What the protocol's own interfaces impose on a codebook variable, and which
 * stage imposes it.
 *
 * The RULES come from `collectInterfaceImpliedRules`, the schema's single
 * definition of them (spec governing rule 1). Their SOURCE — which stage a
 * rule came from, so the editor can name it — comes from running that same
 * collector over each stage on its own: a stage that implies the rule by
 * itself is a stage the rule came from. Deriving the source that way means the
 * editor never has to know which interfaces impose what, which is exactly the
 * knowledge the schema owns.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One stage's contribution to one variable's implied rules. */
type StageContribution = {
  /** The stage's own label, as the researcher named it. */
  label: string;
  rules: EffectiveVariableRules;
};

type Provenance = Map<string, Map<string, StageContribution[]>>;

/**
 * Per-stage collector runs are memoised against the protocol object, so
 * re-rendering the codebook editor does not re-walk the protocol once per
 * stage per keystroke. Keyed weakly: a superseded draft is collectable.
 */
const provenanceCache = new WeakMap<object, Provenance>();

/** The stage label a researcher would recognise, however sparse the draft. */
const stageLabel = (stage: unknown): string => {
  if (isRecord(stage)) {
    if (typeof stage.label === 'string' && stage.label.trim() !== '') {
      return stage.label;
    }
    if (typeof stage.type === 'string') return stage.type;
  }
  return 'this stage';
};

const buildProvenance = (protocol: Record<string, unknown>): Provenance => {
  const provenance: Provenance = new Map();
  const stages = Array.isArray(protocol.stages) ? protocol.stages : [];

  stages.forEach((stage) => {
    // One stage in isolation: whatever the collector reports for it is what
    // this stage alone implies.
    const single = collectInterfaceImpliedRules({
      ...protocol,
      stages: [stage],
    });
    const label = stageLabel(stage);
    for (const [subjectKey, forSubject] of single) {
      for (const [variableId, rules] of forSubject) {
        const bySubject = provenance.get(subjectKey) ?? new Map();
        const contributions = bySubject.get(variableId) ?? [];
        contributions.push({ label, rules });
        bySubject.set(variableId, contributions);
        provenance.set(subjectKey, bySubject);
      }
    }
  });

  return provenance;
};

const provenanceFor = (protocol: unknown): Provenance => {
  if (!isRecord(protocol)) return new Map();
  const cached = provenanceCache.get(protocol);
  if (cached) return cached;
  const built = buildProvenance(protocol);
  provenanceCache.set(protocol, built);
  return built;
};

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

  const contributions = provenanceFor(protocol).get(key)?.get(variableId) ?? [];
  const alwaysAnsweredBy: string[] = [];
  const selectionPinnedBy: string[] = [];
  for (const contribution of contributions) {
    if (contribution.rules.required === true) {
      alwaysAnsweredBy.push(contribution.label);
    }
    if (contribution.rules.maxSelected !== undefined) {
      selectionPinnedBy.push(contribution.label);
    }
  }

  return {
    rules,
    binOnly,
    alwaysAnsweredBy: [...new Set(alwaysAnsweredBy)],
    selectionPinnedBy: [...new Set(selectionPinnedBy)],
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
