import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  type EffectiveVariableRules,
  type ImpliedRuleSource,
  type ResolvedVariableSynthetic,
  resolveNumberWindow,
  resolveVariableSynthetic,
  SCALAR_DOMAIN,
  type Stage,
  type SyntheticOptionWeight,
  type SyntheticSelectionCount,
  syntheticSubjectKey,
  type Variable,
  type VariableType,
  type Variables,
} from '@codaco/protocol-validation';
import { effectiveSyntheticRules } from '~/components/Synthetic/effectiveRules';
import { stagesImplying } from '~/components/Synthetic/impliedRuleSources';
import {
  formatDatetimeSynthetic,
  formatProbability,
  formatSyntheticDistribution,
  type SyntheticWindow,
} from '~/components/Synthetic/summaries';
import { TEXT_GENERATOR_LABELS } from '~/components/Synthetic/textGenerators';

import {
  isRecord,
  readBoolean,
  readNumber,
  recordAt,
  type UnknownRecord,
} from './documentReaders';

/**
 * The variable half of the read-only overview (spec, Surfaces §4): one row per
 * codebook attribute that synthetic generation can produce a value for, saying
 * what that value will look like, whether the author said so or the schema did,
 * and which of the protocol's own interfaces have already decided part of the
 * answer for them.
 *
 * Every resolved value here comes from `resolveVariableSynthetic` — the
 * schema's single definition of a variable-level default — asked with the
 * EFFECTIVE rules the variable is held to: its own declared validation narrowed
 * by whatever the interfaces collecting it impose, combined by the schema's own
 * `narrowVariableRules`. Nothing in this module decides a default of its own.
 */

export type SyntheticVariableRow = {
  /** Stable identity for the row: a variable id is unique protocol-wide. */
  key: string;
  entity: 'ego' | 'node' | 'edge';
  /** The codebook key of the type this attribute belongs to, where it has one. */
  entityType: string | undefined;
  /** The type's own name, e.g. "Person"; "Ego" where there is no type. */
  entityLabel: string;
  variableId: string;
  name: string;
  type: VariableType;
  /** The resolved value behaviour, e.g. `normal(mean 40, sd 12)`. */
  behaviour: string;
  /** How many options a multi-select categorical picks, where that applies. */
  selection: string | undefined;
  /** How often the question goes unanswered. */
  missing: string;
  /** Whole sentences naming an interface-implied rule and its source stages. */
  notes: string[];
  /** True when the saved document gives this variable a `synthetic` block. */
  authored: boolean;
};

const NEVER_MISSING = 'Never';

/** The scale a scalar is recorded on, as the formatter's elision window. */
const SCALAR_WINDOW: SyntheticWindow = {
  min: SCALAR_DOMAIN.minValue,
  max: SCALAR_DOMAIN.maxValue,
};

const trueShareLabel = (probability: number): string =>
  `True ${formatProbability(probability)} of the time`;

const quoted = (names: readonly string[]): string =>
  names.map((name) => `“${name}”`).join(', ');

/**
 * The rules the variable itself declares, in the shape the schema's resolver
 * and combiner both take. Read structurally because `validation` is a
 * different object on every variable type, and only these fields shape a
 * generated value.
 */
const declaredRules = (variable: Variable): EffectiveVariableRules => {
  const validation =
    'validation' in variable && isRecord(variable.validation)
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

/** An option list's labels, keyed by the value a weight table names. */
const optionLabels = (variable: Variable): Map<string, string> => {
  const labels = new Map<string, string>();
  if (!('options' in variable) || variable.options === undefined) return labels;
  for (const option of variable.options) {
    labels.set(String(option.value), option.label);
  }
  return labels;
};

const formatOptionWeights = (
  weights: readonly SyntheticOptionWeight[],
  labels: Map<string, string>,
): string =>
  weights
    .map((entry) => {
      const label = labels.get(String(entry.value)) ?? String(entry.value);
      return `${label} ×${entry.weight}`;
    })
    .join(', ');

const formatSelectionCount = (selection: SyntheticSelectionCount): string =>
  selection.probabilities
    .map((entry) => `${entry.count} (${formatProbability(entry.probability)})`)
    .join(', ');

type Behaviour = { behaviour: string; selection: string | undefined };

const describeBehaviour = (
  descriptor: ResolvedVariableSynthetic,
  variable: Variable,
  rules: EffectiveVariableRules,
): Behaviour => {
  switch (descriptor.type) {
    case 'text':
      return {
        behaviour: TEXT_GENERATOR_LABELS[descriptor.generator],
        selection: undefined,
      };
    case 'number':
      return {
        behaviour: formatSyntheticDistribution(descriptor, {
          window: resolveNumberWindow(rules),
        }),
        selection: undefined,
      };
    case 'scalar':
      return {
        behaviour: formatSyntheticDistribution(descriptor, {
          window: SCALAR_WINDOW,
        }),
        selection: undefined,
      };
    case 'boolean':
      return {
        behaviour: trueShareLabel(descriptor.probabilityTrue),
        selection: undefined,
      };
    case 'ordinal':
      return {
        behaviour: formatOptionWeights(
          descriptor.optionWeights,
          optionLabels(variable),
        ),
        selection: undefined,
      };
    case 'categorical':
      return {
        behaviour: formatOptionWeights(
          descriptor.optionWeights,
          optionLabels(variable),
        ),
        selection: formatSelectionCount(descriptor.selectionCount),
      };
    case 'datetime':
      return {
        behaviour: formatDatetimeSynthetic(descriptor),
        selection: undefined,
      };
  }
};

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
  implied: EffectiveVariableRules | undefined,
  declared: EffectiveVariableRules,
  binOnly: boolean,
  sources: readonly ImpliedRuleSource[],
  stages: readonly Stage[],
): string[] => {
  const notes: string[] = [];
  const naming = (
    implies: (rules: EffectiveVariableRules) => boolean,
  ): string | undefined => {
    const labels = stagesImplying(sources, stages, implies);
    return labels.length === 0 ? undefined : quoted(labels);
  };

  if (implied?.required === true && declared.required !== true) {
    const named = naming((rules) => rules.required === true);
    notes.push(
      named === undefined
        ? 'Always answered: the interfaces that collect this attribute cannot leave it blank.'
        : `Always answered: ${named} cannot leave this attribute blank.`,
    );
  }

  if (implied?.maxSelected === 1 && declared.maxSelected !== 1) {
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

type Subject = {
  entity: 'ego' | 'node' | 'edge';
  type: string | undefined;
  entityLabel: string;
  variables: Variables | undefined;
  /** The same variables as the saved document states them. */
  document: UnknownRecord | undefined;
};

const subjectsOf = (
  protocol: CurrentProtocol,
  document: UnknownRecord | undefined,
): Subject[] => {
  const documentCodebook = recordAt(document, 'codebook');
  const subjects: Subject[] = [];

  const { codebook } = protocol;
  if (codebook.ego?.variables) {
    subjects.push({
      entity: 'ego',
      type: undefined,
      entityLabel: 'Ego',
      variables: codebook.ego.variables,
      document: recordAt(recordAt(documentCodebook, 'ego'), 'variables'),
    });
  }

  for (const entity of ['node', 'edge'] as const) {
    for (const [type, definition] of Object.entries(codebook[entity] ?? {})) {
      if (!definition.variables) continue;
      subjects.push({
        entity,
        type,
        entityLabel: definition.name ?? type,
        variables: definition.variables,
        document: recordAt(
          recordAt(recordAt(documentCodebook, entity), type),
          'variables',
        ),
      });
    }
  }

  return subjects;
};

export const buildVariableRows = (
  protocol: CurrentProtocol,
  document: unknown,
): SyntheticVariableRow[] => {
  const documentRecord = isRecord(document) ? document : undefined;
  const interfaceRules = collectInterfaceImpliedRules(protocol);
  const rows: SyntheticVariableRow[] = [];

  for (const subject of subjectsOf(protocol, documentRecord)) {
    const subjectKey = syntheticSubjectKey({
      entity: subject.entity,
      type: subject.type,
    });
    const subjectRules = interfaceRules.get(subjectKey);
    const binOnlyHere = interfaceRules.binOnlyVariables.get(subjectKey);
    const sourcesHere = interfaceRules.impliedRuleSources.get(subjectKey);

    for (const [variableId, variable] of Object.entries(
      subject.variables ?? {},
    )) {
      const declared = declaredRules(variable);
      const implied = subjectRules?.get(variableId);
      const binOnly = binOnlyHere?.has(variableId) ?? false;
      // Through the shared gate, not `narrowVariableRules` directly: a
      // bin-only variable's own validation is enforced by nobody — not the
      // interview, not generation — so a row that resolved against it would
      // describe a value the run never writes (a `minSelected: 2` beside the
      // very note saying the bin assigns exactly one).
      const effective = effectiveSyntheticRules(
        declared,
        implied ?? {},
        binOnly,
      );
      const descriptor = resolveVariableSynthetic(variable, effective);
      // `layout` and `location` resolve to nothing: generation produces
      // deterministic positions for both, so there is no behaviour to show
      // and no row to be authored.
      if (descriptor === undefined) continue;

      const { behaviour, selection } = describeBehaviour(
        descriptor,
        variable,
        effective,
      );

      rows.push({
        key: `${subjectKey}/${variableId}`,
        entity: subject.entity,
        entityType: subject.type,
        entityLabel: subject.entityLabel,
        variableId,
        name: variable.name,
        type: variable.type,
        behaviour,
        selection,
        missing:
          descriptor.missingProbability === 0
            ? NEVER_MISSING
            : formatProbability(descriptor.missingProbability),
        notes: impliedRuleNotes(
          implied,
          declared,
          binOnly,
          sourcesHere?.get(variableId) ?? [],
          protocol.stages,
        ),
        authored:
          recordAt(subject.document, variableId)?.synthetic !== undefined,
      });
    }
  }

  return rows;
};
