import {
  collectInterfaceImpliedRules,
  syntheticSubjectKey,
  type EffectiveVariableRules,
  type ImpliedRuleSource,
} from '@codaco/protocol-validation';
import { stagesImplying } from '~/components/Synthetic/impliedRuleSources';

import type { CodebookSubject } from './deepLink';
import type { VariableImpliedRules } from './VariableSynthetic/impliedRules';

/**
 * What the protocol's own interfaces have already decided about each attribute
 * of one entity type — the synthetic half of the codebook's attribute table.
 *
 * Two answers come out of ONE walk of the protocol
 * (`collectInterfaceImpliedRules`, the schema's single definition of an
 * interface-implied rule): the rules themselves, which the shared sub-editor
 * needs so a control an interface has made meaningless renders disabled, and
 * the whole sentences the table shows saying which rule, and which stage,
 * decided it. Asking twice would let the note and the control disagree.
 *
 * Nothing here decides a rule of its own. `stagesImplying` names the stage
 * behind a rule — shared with the sub-editor's disabled-control explanations —
 * and the schema owns which interfaces impose what.
 */

export type CodebookVariableSynthetic = {
  /** What the protocol's interfaces impose, for the shared sub-editor. */
  implied: VariableImpliedRules;
  /** Whole sentences naming an implied rule and the stages behind it. */
  notes: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readBoolean = (
  source: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined => {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
};

/**
 * The rules the attribute itself declares, read structurally off the stored
 * codebook entry.
 *
 * Only these fields shape a generated value, and a note is only worth making
 * about a rule the attribute did NOT declare: a `required` an author wrote
 * themselves is already visible in the attribute's own validation, and
 * reporting it as something the interview decided would be false.
 */
const declaredRules = (variable: unknown): EffectiveVariableRules => {
  const validation =
    isRecord(variable) && isRecord(variable.validation)
      ? variable.validation
      : undefined;

  const rules: EffectiveVariableRules = {};
  const required = readBoolean(validation, 'required');
  if (required !== undefined) rules.required = required;
  const unique = readBoolean(validation, 'unique');
  if (unique !== undefined) rules.unique = unique;
  for (const key of [
    'minValue',
    'maxValue',
    'minSelected',
    'maxSelected',
  ] as const) {
    const bound = readNumber(validation, key);
    if (bound !== undefined) rules[key] = bound;
  }
  return rules;
};

const quoted = (names: readonly string[]): string =>
  names.map((name) => `“${name}”`).join(', ');

/**
 * The sentences naming each interface-implied rule and the stages behind it.
 *
 * The source of each rule is the schema's own answer —
 * `collectInterfaceImpliedRules` reports which stage contributed which rule —
 * so a note names the stage that actually imposed the rule rather than every
 * stage that happens to write the attribute. A form that collects the same
 * attribute as a bin is a writer but not a source, and is not named.
 *
 * Whole sentences rather than assembled fragments, so each can be localised as
 * written; the only interpolation is the stages' own labels, which are
 * researcher-authored data rather than copy.
 */
const impliedRuleNotes = (
  implied: EffectiveVariableRules,
  declared: EffectiveVariableRules,
  binOnly: boolean,
  sources: readonly ImpliedRuleSource[],
  stages: readonly unknown[],
): string[] => {
  const notes: string[] = [];
  const naming = (
    implies: (rules: EffectiveVariableRules) => boolean,
  ): string | undefined => {
    const labels = stagesImplying(sources, stages, implies);
    return labels.length === 0 ? undefined : quoted(labels);
  };

  if (implied.required === true && declared.required !== true) {
    const named = naming((rules) => rules.required === true);
    notes.push(
      named === undefined
        ? 'Always answered: the interfaces that collect this attribute cannot leave it blank.'
        : `Always answered: ${named} cannot leave this attribute blank.`,
    );
  }

  if (implied.maxSelected === 1 && declared.maxSelected !== 1) {
    const named = naming((rules) => rules.maxSelected === 1);
    notes.push(
      named === undefined
        ? 'Single choice: the interface that collects this attribute assigns exactly one option.'
        : `Single choice: ${named} assigns exactly one option.`,
    );
  }

  if (binOnly) {
    // Bin-only means EVERY writer is a binning prompt, so every source of
    // this variable's rules is one of those bins — which is why this names
    // them all rather than filtering on a rule.
    const named = naming(() => true);
    notes.push(
      named === undefined
        ? 'Validation is not applied: this attribute is assigned by placement rather than through a form field.'
        : `Validation is not applied: ${named} assigns this attribute by placement rather than through a form field.`,
    );
  }

  return notes;
};

/**
 * One entry per attribute of `subject`, keyed by the attribute's codebook id.
 *
 * `protocol` is the stored document rather than a parse: every reader here is
 * structural, `collectInterfaceImpliedRules` takes the protocol as it stands,
 * and the codebook screen edits a draft that a mid-edit protocol may briefly
 * stop parsing. An attribute the walk says nothing about gets empty rules and
 * no notes, which is the truth about it.
 */
export const buildVariableSyntheticRows = (
  protocol: unknown,
  subject: CodebookSubject,
  variables: Readonly<Record<string, unknown>>,
): Map<string, CodebookVariableSynthetic> => {
  const key = syntheticSubjectKey(subject);
  const collected = collectInterfaceImpliedRules(protocol);
  const subjectRules = collected.get(key);
  const binOnlyHere = collected.binOnlyVariables.get(key);
  const sourcesHere = collected.impliedRuleSources.get(key);
  const stages =
    isRecord(protocol) && Array.isArray(protocol.stages) ? protocol.stages : [];

  const rows = new Map<string, CodebookVariableSynthetic>();
  for (const [variableId, variable] of Object.entries(variables)) {
    const rules = subjectRules?.get(variableId) ?? {};
    const binOnly = binOnlyHere?.has(variableId) === true;
    const sources = sourcesHere?.get(variableId) ?? [];

    rows.set(variableId, {
      implied: {
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
      },
      notes: impliedRuleNotes(
        rules,
        declaredRules(variable),
        binOnly,
        sources,
        stages,
      ),
    });
  }

  return rows;
};
