import { z } from 'zod';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { collectEntityAttributeReferencesFromSchema } from '../../utils/collectEntityAttributeReferences.ts';
import { validateReferences } from '../../utils/validateEntityAttributeReferences.ts';
import {
  entityExists,
  filterRuleAttributeExists,
  filterRuleEntityExists,
  findDuplicateId,
  getFilterRuleVariableType,
  getVariablesForSubject,
  variableExists,
} from '../../utils/validation-helpers.ts';
import { OperatorsByVariableType } from './filters/index.ts';

// Re-export all the split schemas
export * from './assets/index.ts';
export * from './codebook/index.ts';
export * from './common/index.ts';
export * from './filters/index.ts';
export * from './stages/index.ts';
export * from './variables/index.ts';

// Import what we need for the ProtocolSchema
import { assetSchema } from './assets/index.ts';
import {
  type Codebook,
  CodebookSchema,
  type NodeDefinition,
} from './codebook/index.ts';
import {
  ExperimentsSchema,
  type FormField,
  type StageSubject,
} from './common/index.ts';
import type { FilterRule } from './filters/index.ts';
import { type Prompt, type Stage, stageSchema } from './stages/index.ts';
import type { ComposerFormField } from './stages/network-composer.ts';
import {
  ComponentTypes,
  NON_RENDERABLE_VARIABLE_TYPES,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
  VARIABLE_TYPE_COMPONENTS,
} from './variables/index.ts';
import {
  findValidationContradictions,
  type ValidationContradiction,
} from './variables/validation-contradictions.ts';

// Operators that expect numeric values for comparison
const NUMERIC_COMPARISON_OPERATORS = [
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
];
// Operators that count array length (expect numeric value)
const OPTIONS_COUNT_OPERATORS = [
  'OPTIONS_GREATER_THAN',
  'OPTIONS_LESS_THAN',
  'OPTIONS_EQUALS',
  'OPTIONS_NOT_EQUALS',
];
// Operators that expect string values for text matching
const STRING_VALUE_OPERATORS = ['CONTAINS', 'DOES_NOT_CONTAIN'];

type IssueReporter = (issue: {
  message: string;
  path: (string | number)[];
}) => void;

/**
 * Validate a set of filter rules: entity/attribute existence, operator validity
 * by variable type, and value-type by operator. Shared between an inline
 * stage.filter, skipLogic.filter and panel filters.
 *
 * `allowEgoRules` is false for stage NODE/EDGE filters, where an ego rule has no
 * meaning as a node/edge filter (it is silently dropped at runtime).
 */
const validateFilterRules = (
  rules: FilterRule[],
  codebook: Codebook,
  basePath: (string | number)[],
  addIssue: IssueReporter,
  allowEgoRules: boolean,
) => {
  rules.forEach((rule, ruleIndex) => {
    const rulePath = [...basePath, ruleIndex];

    // An ego rule inside a node/edge filter is degenerate.
    if (rule.type === 'ego' && !allowEgoRules) {
      addIssue({
        message:
          'Ego rules are not valid inside a stage node/edge filter; use a node or edge rule.',
        path: [...rulePath, 'type'],
      });
      return;
    }

    const hasAttribute = 'attribute' in rule.options && rule.options.attribute;

    // A type-level ego rule (no attribute) is degenerate: the ego entity always
    // exists, so EXISTS/NOT_EXISTS against it has no meaning.
    if (rule.type === 'ego' && !hasAttribute) {
      addIssue({
        message:
          'An ego rule must reference an attribute; a type-level ego rule (no attribute) is not valid.',
        path: [...rulePath, 'options', 'attribute'],
      });
      return;
    }

    // Check entity exists
    if (!filterRuleEntityExists(rule, codebook)) {
      addIssue({
        message:
          rule.type === 'ego'
            ? 'Entity type "Ego" is not defined in codebook'
            : `Rule option type "${rule.options.type}" is not defined in codebook`,
        path: [...rulePath, 'options', 'type'],
      });
    }

    // Check attribute exists
    const attributeExists =
      !hasAttribute || filterRuleAttributeExists(rule, codebook);
    if (!attributeExists && hasAttribute && 'attribute' in rule.options) {
      addIssue({
        message: `"${rule.options.attribute}" is not a valid variable ID`,
        path: [...rulePath, 'options', 'attribute'],
      });
    }

    // Validate operator based on variable type (only if attribute exists and is valid)
    if (hasAttribute && attributeExists) {
      const variableType = getFilterRuleVariableType(rule, codebook);
      if (variableType) {
        const validOperators = OperatorsByVariableType[variableType];
        const shouldAddIssue =
          validOperators && !validOperators.includes(rule.options.operator);
        if (shouldAddIssue) {
          addIssue({
            message: `Operator "${rule.options.operator}" is not valid for variable type "${variableType}". Valid operators: ${validOperators.join(', ')}`,
            path: [...rulePath, 'options', 'operator'],
          });
        }

        // Validate value type based on operator
        if (rule.options.value !== undefined) {
          const valueType = Array.isArray(rule.options.value)
            ? 'array'
            : typeof rule.options.value;

          // Note: INCLUDES/EXCLUDES accept single values (string, number,
          // boolean) or arrays - they handle conversion at runtime in
          // predicate.js

          if (
            NUMERIC_COMPARISON_OPERATORS.includes(rule.options.operator) &&
            valueType !== 'number'
          ) {
            addIssue({
              message: `Operator "${rule.options.operator}" requires a numeric value, but got ${valueType}`,
              path: [...rulePath, 'options', 'value'],
            });
          }

          if (
            OPTIONS_COUNT_OPERATORS.includes(rule.options.operator) &&
            valueType !== 'number'
          ) {
            addIssue({
              message: `Operator "${rule.options.operator}" requires a numeric value (count), but got ${valueType}`,
              path: [...rulePath, 'options', 'value'],
            });
          }

          if (
            STRING_VALUE_OPERATORS.includes(rule.options.operator) &&
            valueType !== 'string'
          ) {
            addIssue({
              message: `Operator "${rule.options.operator}" requires a string value, but got ${valueType}`,
              path: [...rulePath, 'options', 'value'],
            });
          }
        }
      }
    }
  });
};

const validateFormFieldVariable = (
  codebook: Codebook,
  fieldVariable: string,
  subject: StageSubject,
  path: (string | number)[],
  addIssue: IssueReporter,
) => {
  const variable = getVariablesForSubject(codebook, subject)[fieldVariable];
  if (!variable) return;
  if (NON_RENDERABLE_VARIABLE_TYPES.has(variable.type)) {
    addIssue({
      message: `Form field variable "${fieldVariable}" of type "${variable.type}" cannot be rendered as a form field.`,
      path,
    });
  } else if (!('component' in variable) || variable.component === undefined) {
    addIssue({
      message: `Form field variable "${fieldVariable}" must define a component (input control) to be rendered as a form field.`,
      path,
    });
  }
};

/**
 * NetworkComposer stage-field component check (thirteenth-wave Finding 3). A
 * composer field picks its own `component` from ComposerComponentSchema,
 * which lists every renderable control rather than the ones legal for the
 * variable it writes — so a numeric `age` rendered as a `DatePicker` parsed
 * cleanly, while the runtime rendered a date control and still classified the
 * field numeric (interview's useProtocolForm keys `type: 'number'` off the
 * codebook variable), persisting a date string into a numeric variable.
 *
 * The legal pairings come from `VARIABLE_TYPE_COMPONENTS`, the same lists the
 * codebook variable schemas build their own `component` fields from, so this
 * check cannot drift from what a codebook variable may declare. Layout and
 * location variables have no control at all (their list is empty), so any
 * field for one is rejected with the non-renderable wording
 * `validateFormFieldVariable` uses for ordinary form fields.
 *
 * A field naming a variable absent from the codebook is skipped: the
 * entity-attribute reference pass owns that error.
 *
 * Twenty-eighth-wave Finding 1: `Boolean` is a legal control for every
 * boolean variable regardless of the codebook's own `options` — the pairing
 * check above only cares about `variable.type`, and variable.ts's shape rule
 * only rejects `options: []` when the variable's OWN declared `component` is
 * `Boolean` (see that schema's comment). So a componentless (or
 * Toggle-declared) boolean carrying an explicitly empty `options` array
 * passes the pairing check even where a composer field renders it through
 * `Boolean` — a pairing that IS broken: fresco-ui's BooleanField renders no
 * buttons at all when `options` is an explicit empty array, so the control
 * has nothing to offer a participant. This is the one place a field's
 * EFFECTIVE rendering is known independently of the codebook default, so the
 * check belongs here rather than at the record level.
 */
const validateComposerFieldComponents = (
  codebookVariables: Record<string, Variable>,
  fields: ComposerFormField[] | undefined,
  fieldsPath: (string | number)[],
  addIssue: IssueReporter,
) => {
  if (!fields) return;
  fields.forEach((field, fieldIndex) => {
    const variable = codebookVariables[field.variable];
    if (!variable) return;
    const allowedComponents: readonly string[] =
      VARIABLE_TYPE_COMPONENTS[variable.type];
    const path = [...fieldsPath, fieldIndex, 'component'];
    if (allowedComponents.includes(field.component)) {
      if (
        field.component === ComponentTypes.Boolean &&
        'options' in variable &&
        Array.isArray(variable.options) &&
        variable.options.length === 0
      ) {
        addIssue({
          message: `NetworkComposer field for "${variable.name}" renders it with the "Boolean" control, but its codebook options are empty — the control has no choice to offer.`,
          path,
        });
      }
      return;
    }
    if (allowedComponents.length === 0) {
      addIssue({
        message: `NetworkComposer field variable "${variable.name}" of type "${variable.type}" cannot be rendered as a form field.`,
        path,
      });
      return;
    }
    addIssue({
      message: `NetworkComposer field for "${variable.name}" uses the "${field.component}" input control, which cannot render a ${variable.type} variable. Valid controls: ${allowedComponents.join(', ')}.`,
      path,
    });
  });
};

const REFERENCE_RULE_NAMES: ReadonlySet<string> = new Set<string>(
  VARIABLE_REFERENCE_VALIDATIONS,
);

/**
 * Variable ids reference-connected to any of `seedIds` within `variables`,
 * following the canonical reference-rule list in either direction (seeds
 * included). Used by `validateComposerFieldContradictions` to anchor an
 * overlay-introduced contradiction none of whose participants is itself a
 * field of the form: every analyser pass only ever relates variables along
 * an explicit reference-rule edge, so the causing field's variable is always
 * in this set. The overlay never touches `validation` (only
 * component/parameters), so connectivity over the bare visible subset equals
 * the overlaid view's.
 */
const referenceConnectedIds = (
  variables: Record<string, Variable>,
  seedIds: readonly string[],
): ReadonlySet<string> => {
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    const neighbours = adjacency.get(from);
    if (neighbours) {
      neighbours.add(to);
    } else {
      adjacency.set(from, new Set([to]));
    }
  };
  for (const [id, variable] of Object.entries(variables)) {
    if (!('validation' in variable) || variable.validation === undefined) {
      continue;
    }
    const validation: Record<string, unknown> = variable.validation;
    for (const [rule, target] of Object.entries(validation)) {
      if (
        !REFERENCE_RULE_NAMES.has(rule) ||
        typeof target !== 'string' ||
        !(target in variables)
      ) {
        continue;
      }
      link(id, target);
      link(target, id);
    }
  }
  const connected = new Set(seedIds);
  const queue = [...seedIds];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (connected.has(neighbour)) continue;
      connected.add(neighbour);
      queue.push(neighbour);
    }
  }
  return connected;
};

const contradictionKey = (contradiction: ValidationContradiction): string =>
  [
    contradiction.class,
    [...contradiction.variableIds].toSorted().join(','),
    contradiction.strips
      .map((strip) => `${strip.variableId}:${strip.rule}`)
      .toSorted()
      .join(','),
  ].join('|');

const visibleVariablesForStage = (
  codebookVariables: Record<string, Variable>,
  unknownRendering: ReadonlySet<string>,
): Record<string, Variable> =>
  Object.fromEntries(
    Object.entries(codebookVariables).filter(
      ([id]) => !unknownRendering.has(id),
    ),
  );

// Stage rendering may make a codebook-valid rule set unsatisfiable. Comparing
// stable contradiction identities keeps the codebook refinement responsible
// for errors that already existed before the stage-effective view was applied.
const contradictionsIntroducedByStageRendering = (
  visible: Record<string, Variable>,
  effective: Record<string, unknown>,
): ValidationContradiction[] => {
  const baseKeys = new Set(
    findValidationContradictions(visible).map(contradictionKey),
  );
  return findValidationContradictions(effective, {
    stageEffectiveComponents: true,
  }).filter((contradiction) => !baseKeys.has(contradictionKey(contradiction)));
};

/**
 * NetworkComposer stage-effective-overlay contradiction check (seventh-wave
 * Finding 2; direction fix ninth-wave Finding 2; widened from the narrow
 * mixed-resolution query to the FULL analyser by tenth-wave Finding 1). A
 * NetworkComposer field carries its OWN `component`/`parameters` independent
 * of the codebook variable (see network-composer.ts's
 * ComposerFormFieldSchema), so a stage can render a codebook variable with a
 * different input control than the codebook default — a different DatePicker
 * resolution, or a differently pinned min/max window — and the per-subject
 * codebook check (`rejectValidationContradictions`, run per node/edge type)
 * never sees this, because it only ever looks at the codebook variables
 * themselves. This builds the STAGE-EFFECTIVE view for one subject (codebook
 * definitions with this stage's own composer fields' component/parameters
 * overlaid on top, for exactly the variables those fields write) and runs
 * `findValidationContradictions` against it. Previously only the
 * mixed-resolution sameAs check ran here, so overlay-induced contradictions
 * of every other class — e.g. two sameAs-joined datetime fields pinned to
 * disjoint fixed date windows — slipped through.
 *
 * The overlay models the runtime's own resolution: interview's
 * selectors/forms.ts resolves a composer field's rendering as
 * `fieldComponent ?? codebookComponent` and `fieldParameters ??
 * codebookParameters`, so a field that omits `parameters` INHERITS the
 * codebook variable's rather than rendering with none (twelfth-wave
 * Finding 1). Writing `parameters: undefined` here instead clobbered the
 * codebook's, falsely rejecting e.g. a year-resolution sameAs pair one of
 * whose fields re-declares `component: 'DatePicker'` without repeating
 * `{ type: 'year' }`. `component` is required on ComposerFormFieldSchema, so
 * the field's own value always wins and needs no fallback.
 *
 * The codebook record must itself pass the record-level contradiction check,
 * so any contradiction found in the overlay but NOT in the bare codebook is
 * necessarily introduced by the field overrides. Contradictions the bare
 * codebook already exhibits are skipped rather than double-reported — the
 * record-level check anchors those at the codebook rule. Each remaining
 * contradiction is anchored at the FIRST field (in field-array order) whose
 * variable participates in it.
 *
 * Thirtieth-wave Finding 1: an override can break a pair it never names —
 * pinning A's floor where A declares `sameAs: B` propagates that bound into
 * B through the equality group, and B's OWN comparator against a pinned C
 * becomes infeasible; the analyser reports participants [B, C] only. The
 * participant-membership anchor then finds no field and used to drop the
 * contradiction outright, accepting a stage whose form is unusable. Whether
 * such a no-participant contradiction is the OVERLAY's doing is decided by a
 * SECOND baseline over the same visible subset, run in the same
 * stage-effective mode as the overlaid run (mirroring Architect's
 * findDraftContradictions diff): those two runs differ only in the overlay
 * entries, so a key absent from that baseline is overlay-introduced no
 * matter which variables it names, and is reported — anchored at the first
 * field whose variable is reference-connected to the participants (see
 * `referenceConnectedIds`), or defensively at the fields node itself. A key
 * present in BOTH stage-effective runs is a latent flag-only pair among
 * variables this form never renders (e.g. two singleton-domain Booleans no
 * composer field anywhere overrides) and stays unreported here, exactly as
 * the membership filter always declined it.
 *
 * Twentieth-wave Finding 3: this is a PER-STAGE view, so it may only reason
 * over variables whose effective rendering it actually knows. A variable this
 * form does not write, but some OTHER composer form overrides, renders at that
 * other form's control — reading it here through its unused codebook default
 * invented cross-stage mismatches: two codebook-full datetimes joined by
 * `sameAs`, one rendered as a year picker in stage 1 and the other as a year
 * picker in stage 2, both really store 'YYYY' and both forms submit, yet each
 * stage's view paired its own year override against the other variable's
 * unused full-resolution default and BOTH stages were rejected. Such variables
 * are therefore dropped from the overlay entirely (`unknownRendering`), which
 * makes references to them unusable and leaves the pair unjudged. A variable
 * no composer field overrides anywhere keeps its codebook definition — that
 * default IS its effective rendering, since only NetworkComposer fields carry
 * their own control (the shared `FormFieldSchema` has no component/parameters).
 * The cost is a missed detection: a genuine mismatch whose two endpoints are
 * overridden by two DIFFERENT composer forms is no longer reported. A false
 * rejection is the worse failure for this analyser, so the trade is deliberate.
 */
const validateComposerFieldContradictions = (
  codebookVariables: Record<string, Variable>,
  fields: ComposerFormField[] | undefined,
  fieldsPath: (string | number)[],
  unknownRendering: ReadonlySet<string>,
  addIssue: IssueReporter,
) => {
  if (!fields || fields.length === 0) return;

  const visible = visibleVariablesForStage(codebookVariables, unknownRendering);

  const overlaid: Record<string, unknown> = { ...visible };
  for (const field of fields) {
    const base = codebookVariables[field.variable];
    if (!base) continue;
    // Spreading `base` first, then overriding `parameters` only when the
    // field declares its own, is exactly the runtime's `fieldParameters ??
    // codebookParameters`: absent on the field inherits the codebook's, and
    // absent on both stays absent rather than becoming an explicit undefined.
    overlaid[field.variable] = {
      ...base,
      component: field.component,
      ...(field.parameters !== undefined
        ? { parameters: field.parameters }
        : {}),
    };
  }

  // The baseline runs over the SAME visible subset so its contradiction keys
  // (which carry group membership) are comparable with the overlay's — and in
  // the same RECORD-LEVEL mode as `rejectValidationContradictions`, so its
  // keys are exactly the contradictions the codebook layer already anchors.
  // Only the overlaid run passes `stageEffectiveComponents` (twenty-sixth-wave
  // Finding 1): there every judged variable's `component` is its resolved
  // rendering — the field's own for written variables, the codebook default
  // for variables no composer field anywhere overrides — so an explicit
  // `component: 'Boolean'` may read its `options` as the participant-facing
  // domain here, which the record level (with no stages in scope) never may.
  // A contradiction that needs that reading is by construction absent from
  // the baseline keys, so it reports here, anchored at a participating field.
  // Thirtieth-wave Finding 1 (see the function comment): computed lazily —
  // only a new contradiction with no participating field ever needs it.
  let stageEffectiveBaseKeys: Set<string> | undefined;

  for (const contradiction of contradictionsIntroducedByStageRendering(
    visible,
    overlaid,
  )) {
    const fieldIndex = fields.findIndex((field) =>
      contradiction.variableIds.includes(field.variable),
    );
    const anchorField = fieldIndex === -1 ? undefined : fields[fieldIndex];
    if (anchorField) {
      const anchorName =
        codebookVariables[anchorField.variable]?.name ?? anchorField.variable;
      addIssue({
        message: `NetworkComposer field overrides for "${anchorName}" make its validation contradictory: ${contradiction.message}`,
        path: [...fieldsPath, fieldIndex, 'parameters'],
      });
      continue;
    }

    // No reported participant is a field of this form. Diff against the
    // stage-effective no-overlay baseline: absent means the overlay entries
    // introduced it (the two runs differ in nothing else); present means a
    // latent flag-only pair this form never renders, which is not this
    // stage's to report.
    stageEffectiveBaseKeys ??= new Set(
      findValidationContradictions(visible, {
        stageEffectiveComponents: true,
      }).map(contradictionKey),
    );
    if (stageEffectiveBaseKeys.has(contradictionKey(contradiction))) continue;

    const connected = referenceConnectedIds(visible, contradiction.variableIds);
    const causeIndex = fields.findIndex((field) =>
      connected.has(field.variable),
    );
    const causeField = causeIndex === -1 ? undefined : fields[causeIndex];
    if (!causeField) {
      addIssue({
        message: `NetworkComposer field overrides on this form make validation contradictory: ${contradiction.message}`,
        path: fieldsPath,
      });
      continue;
    }
    const causeName =
      codebookVariables[causeField.variable]?.name ?? causeField.variable;
    addIssue({
      message: `NetworkComposer field overrides for "${causeName}" propagate through its validation rules and make its linked variables contradictory: ${contradiction.message}`,
      path: [...fieldsPath, causeIndex, 'parameters'],
    });
  }
};

/**
 * Shared form fields use the codebook component without an override. The
 * record-level analyser deliberately cannot treat that component as final,
 * because NetworkComposer may replace it elsewhere; a concrete shared form can.
 * Only contradictions involving a field rendered by this form are anchored
 * here. Variables overridden by another composer form remain unknown unless
 * this shared form renders them itself, matching the composer visible-subset
 * rule without hiding the current form's known codebook rendering.
 */
const validateSharedFormContradictions = (
  codebookVariables: Record<string, Variable>,
  fields: FormField[] | undefined,
  fieldsPath: (string | number)[],
  unknownRendering: ReadonlySet<string>,
  addIssue: IssueReporter,
) => {
  if (!fields || fields.length === 0) return;

  const visible = visibleVariablesForStage(codebookVariables, unknownRendering);
  for (const contradiction of contradictionsIntroducedByStageRendering(
    visible,
    visible,
  )) {
    const fieldIndex = fields.findIndex((field) =>
      contradiction.variableIds.includes(field.variable),
    );
    if (fieldIndex === -1) continue;
    const field = fields[fieldIndex];
    if (!field) continue;
    const fieldName = codebookVariables[field.variable]?.name ?? field.variable;
    addIssue({
      message: `Form field for "${fieldName}" renders its codebook component with contradictory validation: ${contradiction.message}`,
      path: [...fieldsPath, fieldIndex, 'variable'],
    });
  }
};

const subjectKey = (subject: StageSubject): string =>
  subject.entity === 'ego' ? 'ego' : `${subject.entity}:${subject.type}`;

/**
 * Every variable a NetworkComposer field anywhere in the protocol renders with
 * its own control, keyed by the subject that variable belongs to. Feeds
 * `validateComposerFieldContradictions`' `unknownRendering` set — see its
 * comment for why a per-stage view must not read another stage's variables
 * through their codebook defaults (twentieth-wave Finding 3).
 */
const collectComposerFieldOverrides = (
  stages: Stage[],
): Map<string, Set<string>> => {
  const counts = new Map<string, Set<string>>();
  const record = (subject: StageSubject, variable: string): void => {
    const key = subjectKey(subject);
    const bucket = counts.get(key) ?? new Set<string>();
    bucket.add(variable);
    counts.set(key, bucket);
  };
  for (const stage of stages) {
    if (stage.type !== 'NetworkComposer') continue;
    for (const field of stage.nodeForm?.fields ?? []) {
      record(stage.subject, field.variable);
    }
    for (const edge of stage.edges ?? []) {
      for (const field of edge.form?.fields ?? []) {
        record(edge.subject, field.variable);
      }
    }
  }
  return counts;
};

/**
 * The subject's variables whose effective rendering THIS form does not
 * determine: overridden by a composer field somewhere, but not by a field of
 * this form.
 */
const unknownRenderingFor = (
  overrides: Map<string, Set<string>>,
  subject: StageSubject,
  fields: readonly { variable: string }[] | undefined,
): ReadonlySet<string> => {
  const bucket = overrides.get(subjectKey(subject));
  if (!bucket) return new Set();
  const written = new Set<string>(
    (fields ?? []).map((field) => field.variable),
  );
  return new Set([...bucket].filter((id) => !written.has(id)));
};

type CanonicalOption = { value: string; label: string };

// True when a variable's options are exactly the canonical set (same members
// and labels, order-independent). Used to enforce the FamilyPedigree
// locked-value-set variables against their interface-owned option sets.
const optionsMatchCanonical = (
  variableOptions: { value: unknown; label?: unknown }[] | undefined,
  canonical: readonly CanonicalOption[],
): boolean => {
  if (!variableOptions || variableOptions.length !== canonical.length) {
    return false;
  }
  return canonical.every((expected) =>
    variableOptions.some(
      (option) =>
        option.value === expected.value && option.label === expected.label,
    ),
  );
};

const ProtocolSchema = z
  .strictObject({
    name: z.string().min(1),
    description: z.string().optional(),
    experiments: ExperimentsSchema.optional(),
    lastModified: z.string().datetime().optional(),
    schemaVersion: z.literal(8),
    codebook: CodebookSchema,
    assetManifest: z.record(z.string(), assetSchema).optional(),
    stages: z.array(stageSchema).superRefine((stages, ctx) => {
      // Check for duplicate stage IDs
      const duplicateStageId = findDuplicateId(stages);
      if (duplicateStageId) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Stages contain duplicate ID "${duplicateStageId}"`,
          path: [],
        });
      }
    }),
  })
  .superRefine((protocol, ctx) => {
    // Use ProtocolSchema (captured by closure) to walk the schema tree and
    // validate all entity-attribute references. ProtocolSchema is guaranteed
    // to be assigned by the time this callback runs (safeParse is called after
    // module initialization completes).
    const hits = collectEntityAttributeReferencesFromSchema(
      ProtocolSchema,
      protocol,
    );
    for (const issue of validateReferences(protocol.codebook, hits)) {
      ctx.addIssue(issue);
    }

    const composerFieldOverrides = collectComposerFieldOverrides(
      protocol.stages,
    );

    // 1. Stage validation
    protocol.stages.forEach((stage, stageIndex) => {
      const skipDestination = stage.skipLogic?.destination;
      if (skipDestination?.type === 'stage') {
        const destinationIndex = protocol.stages.findIndex(
          (candidate) => candidate.id === skipDestination.stageId,
        );

        if (destinationIndex === -1) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Skip destination stage "${skipDestination.stageId}" does not exist.`,
            path: ['stages', stageIndex, 'skipLogic', 'destination', 'stageId'],
          });
        } else if (destinationIndex <= stageIndex) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Skip destination stage "${skipDestination.stageId}" must come after the stage that references it.`,
            path: ['stages', stageIndex, 'skipLogic', 'destination', 'stageId'],
          });
        }
      }

      // Check stage subject exists in codebook
      if ('subject' in stage && stage.subject) {
        if (!entityExists(protocol.codebook, stage.subject)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: 'Stage subject is not defined in the codebook',
            path: ['stages', stageIndex, 'subject'],
          });
        }
      }

      // Canvas image backgrounds must resolve to image assets. The stage-level
      // schema enforces the background shape; this protocol-level check binds
      // the referenced id to the manifest.
      if (
        'background' in stage &&
        stage.background &&
        'image' in stage.background &&
        typeof stage.background.image === 'string'
      ) {
        const imageAssetId = stage.background.image;
        const asset = protocol.assetManifest?.[imageAssetId];
        if (!asset) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Canvas background image "${imageAssetId}" does not reference an asset in the manifest.`,
            path: ['stages', stageIndex, 'background', 'image'],
          });
        } else if (asset.type !== 'image') {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Canvas background image "${imageAssetId}" must reference an 'image' asset, but is of type "${asset.type}".`,
            path: ['stages', stageIndex, 'background', 'image'],
          });
        }
      }

      // Form field type validation: existence is covered by the
      // entity-attribute reference validator above; here we additionally reject
      // variables whose type cannot be rendered as a form field (layout/location).
      if ('form' in stage && stage.form?.fields) {
        let subject: StageSubject | undefined;
        if (stage.type === 'EgoForm') {
          subject = { entity: 'ego' };
        } else if ('subject' in stage && stage.subject) {
          subject = stage.subject;
        }

        stage.form.fields.forEach((field: FormField, fieldIndex: number) => {
          if (subject) {
            validateFormFieldVariable(
              protocol.codebook,
              field.variable,
              subject,
              ['stages', stageIndex, 'form', 'fields', fieldIndex, 'variable'],
              (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
            );
          }
        });
        if (subject) {
          validateSharedFormContradictions(
            getVariablesForSubject(protocol.codebook, subject),
            stage.form.fields,
            ['stages', stageIndex, 'form', 'fields'],
            unknownRenderingFor(
              composerFieldOverrides,
              subject,
              stage.form.fields,
            ),
            (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          );
        }
      }

      // 3b.ii. NetworkComposer: a stage field's own component/parameters
      // overlay must not introduce a validation contradiction the codebook
      // alone does not have (seventh-wave Finding 2, widened by tenth-wave
      // Finding 1) — the editor's sibling-overlay guard only runs in
      // Architect, so an imported protocol can otherwise ship a stage that
      // breaks at interview time. nodeForm and each edge type's form are
      // checked independently: validation references are scoped to a single
      // subject (R2/owningVariable), so they can never share a group.
      if (stage.type === 'NetworkComposer') {
        const nodeVariables = getVariablesForSubject(
          protocol.codebook,
          stage.subject,
        );
        const nodeFormPath = ['stages', stageIndex, 'nodeForm', 'fields'];
        validateComposerFieldComponents(
          nodeVariables,
          stage.nodeForm?.fields,
          nodeFormPath,
          (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
        );
        validateComposerFieldContradictions(
          nodeVariables,
          stage.nodeForm?.fields,
          nodeFormPath,
          unknownRenderingFor(
            composerFieldOverrides,
            stage.subject,
            stage.nodeForm?.fields,
          ),
          (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
        );
        stage.edges?.forEach((edge, edgeIndex) => {
          const edgeVariables = getVariablesForSubject(
            protocol.codebook,
            edge.subject,
          );
          const edgeFormPath = [
            'stages',
            stageIndex,
            'edges',
            edgeIndex,
            'form',
            'fields',
          ];
          validateComposerFieldComponents(
            edgeVariables,
            edge.form?.fields,
            edgeFormPath,
            (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          );
          validateComposerFieldContradictions(
            edgeVariables,
            edge.form?.fields,
            edgeFormPath,
            unknownRenderingFor(
              composerFieldOverrides,
              edge.subject,
              edge.form?.fields,
            ),
            (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          );
        });
      }

      // 3c. Comprehensive prompt validation (duplicate ID validation moved to individual stage schemas)
      if ('prompts' in stage && stage.prompts) {
        stage.prompts.forEach((prompt: Prompt, promptIndex: number) => {
          // createEdge references validation (entity-type reference, not attribute)
          if ('createEdge' in prompt && prompt.createEdge) {
            if (
              !(
                protocol.codebook.edge &&
                Object.keys(protocol.codebook.edge).includes(prompt.createEdge)
              )
            ) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `"${prompt.createEdge}" definition for createEdge not found in codebook["edge"]`,
                path: [
                  'stages',
                  stageIndex,
                  'prompts',
                  promptIndex,
                  'createEdge',
                ],
              });
            }
          }

          // layoutVariable type check (existence is covered by the
          // entity-attribute reference validator). A sociogram layout variable
          // must be of type "layout".
          if (
            'layout' in prompt &&
            prompt.layout &&
            'layoutVariable' in prompt.layout &&
            prompt.layout.layoutVariable &&
            typeof prompt.layout.layoutVariable === 'string' &&
            'subject' in stage &&
            stage.subject
          ) {
            const layoutVariable = prompt.layout.layoutVariable;
            const variable = getVariablesForSubject(
              protocol.codebook,
              stage.subject,
            )[layoutVariable];
            if (variable && variable.type !== 'layout') {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Layout variable "${layoutVariable}" must be of type "layout", but is "${variable.type}".`,
                path: [
                  'stages',
                  stageIndex,
                  'prompts',
                  promptIndex,
                  'layout',
                  'layoutVariable',
                ],
              });
            }
          }

          // highlight.variable type check (existence covered by the
          // entity-attribute reference validator): must reference a boolean.
          if (
            'highlight' in prompt &&
            prompt.highlight &&
            'variable' in prompt.highlight &&
            prompt.highlight.variable &&
            'subject' in stage &&
            stage.subject
          ) {
            const highlightVariable = prompt.highlight.variable;
            const variable = getVariablesForSubject(
              protocol.codebook,
              stage.subject,
            )[highlightVariable];
            if (variable && variable.type !== 'boolean') {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Highlight variable "${highlightVariable}" must be of type "boolean", but is "${variable.type}".`,
                path: [
                  'stages',
                  stageIndex,
                  'prompts',
                  promptIndex,
                  'highlight',
                  'variable',
                ],
              });
            }
          }
        });
      }

      // 3e. NameGeneratorQuickAdd: quickAdd must reference an existing text
      // variable on the subject node type.
      if (
        stage.type === 'NameGeneratorQuickAdd' &&
        'quickAdd' in stage &&
        stage.quickAdd &&
        'subject' in stage &&
        stage.subject
      ) {
        const variable = getVariablesForSubject(
          protocol.codebook,
          stage.subject,
        )[stage.quickAdd];
        if (variable && variable.type !== 'text') {
          ctx.addIssue({
            code: 'custom' as const,
            message: `quickAdd variable "${stage.quickAdd}" must be of type "text", but is "${variable.type}".`,
            path: ['stages', stageIndex, 'quickAdd'],
          });
        }
      }

      // 3e.ii. NameGeneratorRoster: dataSource must reference a manifest entry
      // of type 'network' (reject 'existing', missing ids, non-network types).
      if (stage.type === 'NameGeneratorRoster' && 'dataSource' in stage) {
        const asset = protocol.assetManifest?.[stage.dataSource];
        if (!asset) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Roster dataSource "${stage.dataSource}" does not reference an asset in the manifest.`,
            path: ['stages', stageIndex, 'dataSource'],
          });
        } else if (asset.type !== 'network') {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Roster dataSource "${stage.dataSource}" must reference a 'network' asset, but is of type "${asset.type}".`,
            path: ['stages', stageIndex, 'dataSource'],
          });
        }
      }

      // 3e.iii. Geospatial: token/dataSource map assets must resolve to manifest
      // entries of the correct type, and the prompt variable must be 'location'.
      if (stage.type === 'Geospatial' && 'mapOptions' in stage) {
        const checkMapAsset = (
          assetId: string,
          allowedTypes: string[],
          field: 'tokenAssetId' | 'dataSourceAssetId',
        ) => {
          const asset = protocol.assetManifest?.[assetId];
          if (!asset) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `Geospatial ${field} "${assetId}" does not reference an asset in the manifest.`,
              path: ['stages', stageIndex, 'mapOptions', field],
            });
          } else if (!allowedTypes.includes(asset.type)) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `Geospatial ${field} "${assetId}" must reference an asset of type ${allowedTypes.map((t) => `'${t}'`).join(' or ')}, but is of type "${asset.type}".`,
              path: ['stages', stageIndex, 'mapOptions', field],
            });
          }
        };

        checkMapAsset(
          stage.mapOptions.tokenAssetId,
          ['apikey'],
          'tokenAssetId',
        );
        checkMapAsset(
          stage.mapOptions.dataSourceAssetId,
          ['geojson', 'network'],
          'dataSourceAssetId',
        );

        if ('subject' in stage && stage.subject) {
          stage.prompts.forEach((prompt, promptIndex) => {
            if (
              'variable' in prompt &&
              prompt.variable &&
              variableExists(protocol.codebook, stage.subject, prompt.variable)
            ) {
              const variable = getVariablesForSubject(
                protocol.codebook,
                stage.subject,
              )[prompt.variable];
              if (variable && variable.type !== 'location') {
                ctx.addIssue({
                  code: 'custom' as const,
                  message: `Geospatial prompt variable "${prompt.variable}" must be of type "location", but is "${variable.type}".`,
                  path: [
                    'stages',
                    stageIndex,
                    'prompts',
                    promptIndex,
                    'variable',
                  ],
                });
              }
            }
          });
        }
      }

      // 3e.iii.b. FamilyPedigree: each introScreen asset item must resolve to
      // a manifest entry of a displayable type (image/video/audio).
      if (
        stage.type === 'FamilyPedigree' &&
        'introScreen' in stage &&
        stage.introScreen
      ) {
        const displayableAssetTypes = ['image', 'video', 'audio'];
        stage.introScreen.items.forEach((item, itemIndex) => {
          if (item.type !== 'asset') {
            return;
          }
          const asset = protocol.assetManifest?.[item.content];
          if (!asset) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `FamilyPedigree introScreen item "${item.content}" does not reference an asset in the manifest.`,
              path: [
                'stages',
                stageIndex,
                'introScreen',
                'items',
                itemIndex,
                'content',
              ],
            });
          } else if (!displayableAssetTypes.includes(asset.type)) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `FamilyPedigree introScreen item "${item.content}" must reference an asset of type ${displayableAssetTypes.map((t) => `'${t}'`).join(' or ')}, but is of type "${asset.type}".`,
              path: [
                'stages',
                stageIndex,
                'introScreen',
                'items',
                itemIndex,
                'content',
              ],
            });
          }
        });
      }

      if (stage.type === 'FamilyPedigree' && stage.nodeConfig.form) {
        const nodeSubject = {
          entity: 'node' as const,
          type: stage.nodeConfig.type,
        };
        stage.nodeConfig.form.forEach((field, fieldIndex) => {
          validateFormFieldVariable(
            protocol.codebook,
            field.variable,
            nodeSubject,
            [
              'stages',
              stageIndex,
              'nodeConfig',
              'form',
              fieldIndex,
              'variable',
            ],
            (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          );
        });
        validateSharedFormContradictions(
          getVariablesForSubject(protocol.codebook, nodeSubject),
          stage.nodeConfig.form,
          ['stages', stageIndex, 'nodeConfig', 'form'],
          unknownRenderingFor(
            composerFieldOverrides,
            nodeSubject,
            stage.nodeConfig.form,
          ),
          (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
        );
      }

      // 3e.iii.b-2. FamilyPedigree: each nomination prompt variable must exist
      // on the node type and be boolean — the interview writes a boolean flag
      // onto nominated nodes, so a missing or non-boolean variable would write
      // to an undeclared/mismatched codebook variable.
      if (stage.type === 'FamilyPedigree' && stage.nominationPrompts) {
        const nodeSubject = {
          entity: 'node' as const,
          type: stage.nodeConfig.type,
        };
        const nodeVariables = getVariablesForSubject(
          protocol.codebook,
          nodeSubject,
        );
        stage.nominationPrompts.forEach((prompt, promptIndex) => {
          const nodeVariable = nodeVariables[prompt.variable];
          if (!nodeVariable) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `FamilyPedigree nomination prompt variable "${prompt.variable}" does not exist on node type "${stage.nodeConfig.type}".`,
              path: [
                'stages',
                stageIndex,
                'nominationPrompts',
                promptIndex,
                'variable',
              ],
            });
          } else if (nodeVariable.type !== 'boolean') {
            ctx.addIssue({
              code: 'custom' as const,
              message: `FamilyPedigree nomination prompt variable "${prompt.variable}" must be a boolean variable, but is "${nodeVariable.type}".`,
              path: [
                'stages',
                stageIndex,
                'nominationPrompts',
                promptIndex,
                'variable',
              ],
            });
          }
        });
      }

      // 3e.iii.b-3. FamilyPedigree: the biological-sex, relationship-type, and
      // gamete-role variables carry interface-owned value sets the interview and
      // genetics engine depend on. Architect locks these options at creation, but
      // nothing re-checks them afterwards; guard against a variable whose options
      // were edited away from its canonical set. Only fires when the referenced
      // variable exists and is a categorical or ordinal (both carry a locked
      // options set) with a mismatched option set — so a legitimately-authored
      // protocol (whose options already match) always passes.
      if (stage.type === 'FamilyPedigree') {
        const nodeVariables = getVariablesForSubject(protocol.codebook, {
          entity: 'node',
          type: stage.nodeConfig.type,
        });
        const edgeVariables = getVariablesForSubject(protocol.codebook, {
          entity: 'edge',
          type: stage.edgeConfig.type,
        });

        const checkLockedOptions = (
          variableId: string,
          variable: (typeof nodeVariables)[string] | undefined,
          canonical: readonly CanonicalOption[],
          label: string,
          path: (string | number)[],
        ) => {
          if (
            variable &&
            (variable.type === 'categorical' || variable.type === 'ordinal') &&
            !optionsMatchCanonical(variable.options, canonical)
          ) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `FamilyPedigree ${label} variable "${variableId}" must use its fixed set of options and cannot be modified.`,
              path,
            });
          }
        };

        checkLockedOptions(
          stage.nodeConfig.biologicalSexVariable,
          nodeVariables[stage.nodeConfig.biologicalSexVariable],
          BIOLOGICAL_SEX_OPTIONS,
          'biological sex',
          ['stages', stageIndex, 'nodeConfig', 'biologicalSexVariable'],
        );
        checkLockedOptions(
          stage.edgeConfig.relationshipTypeVariable,
          edgeVariables[stage.edgeConfig.relationshipTypeVariable],
          RELATIONSHIP_TYPE_OPTIONS,
          'relationship type',
          ['stages', stageIndex, 'edgeConfig', 'relationshipTypeVariable'],
        );
        checkLockedOptions(
          stage.edgeConfig.gameteRoleVariable,
          edgeVariables[stage.edgeConfig.gameteRoleVariable],
          GAMETE_ROLE_OPTIONS,
          'gamete role',
          ['stages', stageIndex, 'edgeConfig', 'gameteRoleVariable'],
        );
      }

      // 3e.iii.c. NarrativePedigree: sourceStageId must reference a FamilyPedigree
      // stage; disease variables must resolve on the source node type.
      if (stage.type === 'NarrativePedigree') {
        const sourceStage = protocol.stages.find(
          (s) => s.id === stage.sourceStageId,
        );

        if (!sourceStage) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `NarrativePedigree sourceStageId "${stage.sourceStageId}" does not reference an existing stage.`,
            path: ['stages', stageIndex, 'sourceStageId'],
          });
        } else if (sourceStage.type !== 'FamilyPedigree') {
          ctx.addIssue({
            code: 'custom' as const,
            message: `NarrativePedigree sourceStageId "${stage.sourceStageId}" must reference a FamilyPedigree stage, but references a "${sourceStage.type}" stage.`,
            path: ['stages', stageIndex, 'sourceStageId'],
          });
        } else {
          // sourceStage is confirmed FamilyPedigree — resolve variables on its node type.
          const sourceNodeType = sourceStage.nodeConfig.type;
          const sourceSubject = {
            entity: 'node' as const,
            type: sourceNodeType,
          };
          const sourceVariables = getVariablesForSubject(
            protocol.codebook,
            sourceSubject,
          );

          stage.diseases.forEach((disease, diseaseIndex) => {
            const sourceVariable = sourceVariables[disease.variable];
            if (!sourceVariable) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `NarrativePedigree disease variable "${disease.variable}" does not exist on source node type "${sourceNodeType}".`,
                path: [
                  'stages',
                  stageIndex,
                  'diseases',
                  diseaseIndex,
                  'variable',
                ],
              });
            } else if (sourceVariable.type !== 'boolean') {
              // The genetics engine's affection predicate is a strict boolean
              // `=== true`; a non-boolean variable would silently yield an empty
              // affected set (a clinically blank pedigree).
              ctx.addIssue({
                code: 'custom' as const,
                message: `NarrativePedigree disease variable "${disease.variable}" must be a boolean variable (affected/not affected), but is "${sourceVariable.type}".`,
                path: [
                  'stages',
                  stageIndex,
                  'diseases',
                  diseaseIndex,
                  'variable',
                ],
              });
            }
          });
        }
      }

      // 3e.iv. Bin stages: the prompt variable must match the bin type.
      if (
        (stage.type === 'OrdinalBin' || stage.type === 'CategoricalBin') &&
        'subject' in stage &&
        stage.subject
      ) {
        const expectedType =
          stage.type === 'OrdinalBin' ? 'ordinal' : 'categorical';
        stage.prompts.forEach((prompt, promptIndex) => {
          if (
            'variable' in prompt &&
            prompt.variable &&
            variableExists(protocol.codebook, stage.subject, prompt.variable)
          ) {
            const variable = getVariablesForSubject(
              protocol.codebook,
              stage.subject,
            )[prompt.variable];
            if (variable && variable.type !== expectedType) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `${stage.type} prompt variable "${prompt.variable}" must be of type "${expectedType}", but is "${variable.type}".`,
                path: [
                  'stages',
                  stageIndex,
                  'prompts',
                  promptIndex,
                  'variable',
                ],
              });
            }
          }
        });
      }

      // External-data panels: filter rules must target node attributes,
      // not edges (the panel data source is a flat list of node rows).
      if ('panels' in stage && stage.panels) {
        stage.panels.forEach((panel, panelIndex) => {
          if (panel.dataSource !== 'existing' && panel.filter?.rules) {
            panel.filter.rules.forEach((rule, ruleIndex) => {
              if (rule.type === 'edge') {
                ctx.addIssue({
                  code: 'custom' as const,
                  message:
                    'External-data panel filters cannot use edge rules; rules must target node attributes.',
                  path: [
                    'stages',
                    stageIndex,
                    'panels',
                    panelIndex,
                    'filter',
                    'rules',
                    ruleIndex,
                    'type',
                  ],
                });
              }
            });
          }
        });
      }

      // Note: Panels duplicate ID validation moved to individual stage schemas

      // Note: Items duplicate ID validation moved to individual stage schemas

      // Filter rules validation (comprehensive)
      if ('filter' in stage && stage.filter?.rules) {
        const duplicateRuleId = findDuplicateId(stage.filter.rules);
        if (duplicateRuleId) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Rules contain duplicate ID "${duplicateRuleId}"`,
            path: ['stages', stageIndex, 'filter', 'rules'],
          });
        }

        // A stage NODE/EDGE filter cannot use ego rules (degenerate at
        // runtime); ego rules remain valid in skipLogic/panel/query filters.
        validateFilterRules(
          stage.filter.rules,
          protocol.codebook,
          ['stages', stageIndex, 'filter', 'rules'],
          (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          false,
        );
      }

      // 3g.ii. skipLogic.filter rules — operator/value and ego-attribute
      // validation (ego rules allowed here, unlike a stage node/edge filter).
      if (stage.skipLogic?.filter?.rules) {
        validateFilterRules(
          stage.skipLogic.filter.rules,
          protocol.codebook,
          ['stages', stageIndex, 'skipLogic', 'filter', 'rules'],
          (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
          true,
        );
      }

      // 3g.iii. panels[].filter rules — same validation per panel.
      if ('panels' in stage && stage.panels) {
        stage.panels.forEach((panel, panelIndex) => {
          if (panel.filter?.rules) {
            validateFilterRules(
              panel.filter.rules,
              protocol.codebook,
              ['stages', stageIndex, 'panels', panelIndex, 'filter', 'rules'],
              (issue) => ctx.addIssue({ code: 'custom' as const, ...issue }),
              true,
            );
          }
        });
      }

      // 3h. Check any nested filter rules recursively for duplicate IDs (for
      // skipLogic, panels, etc.)
      const validateNestedFilters = (
        obj: unknown,
        basePath: (string | number)[],
      ) => {
        if (typeof obj === 'object' && obj !== null) {
          if ('rules' in obj && Array.isArray(obj.rules)) {
            const rules = obj.rules as unknown[];
            const duplicateNestedRuleId = findDuplicateId(
              rules as { id: string }[],
            );
            if (duplicateNestedRuleId) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Rules contain duplicate ID "${duplicateNestedRuleId}"`,
                path: [...basePath, 'rules'],
              });
            }
          }
          // Recursively check nested objects
          for (const [key, value] of Object.entries(obj)) {
            validateNestedFilters(value, [...basePath, key]);
          }
        }
      };
      validateNestedFilters(stage, ['stages', stageIndex]);
    });

    // Validate node shape mappings
    if (protocol.codebook.node) {
      const discreteEligibleTypes = new Set([
        'categorical',
        'ordinal',
        'boolean',
      ]);
      const breakpointEligibleTypes = new Set(['number', 'scalar']);

      for (const [nodeType, nodeDef] of Object.entries(
        protocol.codebook.node,
      ) as [string, NodeDefinition][]) {
        if (nodeDef.shape?.dynamic) {
          const { dynamic } = nodeDef.shape;
          const basePath = ['codebook', 'node', nodeType, 'shape', 'dynamic'];

          const variable = nodeDef.variables?.[dynamic.variable];
          if (variable) {
            if (
              dynamic.type === 'discrete' &&
              !discreteEligibleTypes.has(variable.type)
            ) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Discrete shape mapping requires a categorical, ordinal, or boolean variable, but "${dynamic.variable}" is of type "${variable.type}"`,
                path: [...basePath, 'type'],
              });
            }
            if (
              dynamic.type === 'breakpoints' &&
              !breakpointEligibleTypes.has(variable.type)
            ) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Breakpoint shape mapping requires a number or scalar variable, but "${dynamic.variable}" is of type "${variable.type}"`,
                path: [...basePath, 'type'],
              });
            }
          }
        }
      }
    }
  });

export type ProtocolSchemaV8 = z.infer<typeof ProtocolSchema>;

export default ProtocolSchema;
