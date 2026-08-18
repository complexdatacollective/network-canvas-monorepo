import {
  createMigration,
  type ProtocolDocument,
} from '../../migration/index.ts';
import { traverseAndTransform } from '../../utils/traverse-and-transform.ts';
import { ordinalColorSequence } from './common/prompts.ts';
import { NON_RENDERABLE_VARIABLE_TYPES } from './variables/types.ts';
import {
  type ContradictionClass,
  findValidationContradictions,
  isRelativeDatePickerShape,
  type ValidationContradiction,
} from './variables/validation-contradictions.ts';
import { VARIABLE_REFERENCE_VALIDATIONS } from './variables/validation.ts';
import {
  DATE_RESOLUTION,
  isIsoDate,
  isValidDateAtResolution,
  VARIABLE_TYPE_COMPONENTS,
  VARIABLE_TYPE_VALIDATIONS,
} from './variables/variable.ts';

// Operators whose operand is a categorical option value (as opposed to a count,
// like OPTIONS_*, or a regex). Their legacy scalar operands are wrapped in a
// single-element array so categorical rules use the array contract.
const CATEGORICAL_VALUE_OPERATORS = new Set([
  'EXACTLY',
  'NOT',
  'INCLUDES',
  'EXCLUDES',
]);

// V8 restricts an OrdinalBin prompt's color to the ten-value ord-color-seq
// palette; any other legacy value is dropped during migration.
const VALID_ORDINAL_PROMPT_COLORS = new Set<unknown>(ordinalColorSequence);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

// String-keyed views of the per-type rule and control records, so migration
// steps (which read raw, untyped v7 JSON) can index them with a plain string
// without asserting the variable's `type` is a known member first.
const VALIDATION_RULES_BY_TYPE: Record<
  string,
  Partial<Record<string, true>>
> = VARIABLE_TYPE_VALIDATIONS;
const COMPONENTS_BY_TYPE: Record<string, readonly string[]> =
  VARIABLE_TYPE_COMPONENTS;

// The value kind each v8 validation rule requires. Together these cover every
// key of the v8 `validations` record; anything else is an unknown rule.
const BOOLEAN_VALUED_VALIDATIONS = new Set([
  'required',
  'requiredAcceptsNull',
  'unique',
]);
const NUMBER_VALUED_VALIDATIONS = new Set([
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
]);
const REFERENCE_VALUED_VALIDATIONS = new Set<string>(
  VARIABLE_REFERENCE_VALIDATIONS,
);

// `ValidationContradiction.variableIds` is documented as "every variable
// participating in the contradiction", which is exactly the property batching
// (below) needs: two contradictions with disjoint `variableIds` cannot affect
// one another's outcome UNLESS one of them was computed from a variable it
// never listed. Every class satisfies that except these three:
//
//   - `pinnedEqualDifferentFrom`: `pinnedEqualDifferentFromContradictions`
//     falls back to `propagatedPins` (the chained-bound-propagation closure)
//     for either endpoint whose own rules don't already pin it. That pin can
//     be seeded and carried by an entire OTHER comparator chain of variables
//     the contradiction never lists in `variableIds` — see the doc comment on
//     `propagatedPins` in validation-contradictions.ts — so stripping one of
//     those unlisted variables' bounds elsewhere in the same pass can change
//     the pin without this batching check ever seeing it.
//   - `disjointBounds`: one class tag covers three different checks, and the
//     cross-group edge check inside `disjointBoundsContradictions` judges an
//     edge's two endpoint variables against their whole EQUALITY GROUP's
//     merged interval (`groupIntervals`, built by intersecting every member's
//     own bound) — but reports only the edge's two endpoints as
//     `variableIds`, not the other group members whose bounds may have
//     supplied the tightest value. The class tag can't distinguish that check
//     from the group-level and chain-witness checks that share it (both of
//     which DO report every contributing member), so the whole class stays
//     one-at-a-time.
//   - `pinnedDifferentFromParity`: the datetime parity check consumes
//     `propagatedPins`, whose values can be supplied by comparator chains
//     outside the reported differentFrom path. Repairing an unlisted source
//     chain can dissolve the apparent parity conflict, so it must be
//     re-analysed before its strips are applied.
const NON_BATCHABLE_CONTRADICTION_CLASSES = new Set<ContradictionClass>([
  'pinnedEqualDifferentFrom',
  'disjointBounds',
  'pinnedDifferentFromParity',
]);

/**
 * The contradictions the strip fixpoint may repair TOGETHER in one pass.
 * Repairing strictly one contradiction per pass and re-running the whole
 * analyser is quadratic in the number of independent repairs (measured
 * 0.19s / 0.72s / 2.3s for 100 / 200 / 400 disjoint contradiction pairs), and
 * the one-at-a-time rule only ever existed to protect INTERDEPENDENT
 * contradictions, where one repair takes another off the list before it is
 * ever applied (see the step's own comment).
 *
 * A repair is batchable only when it is provably independent of every other:
 *
 *   - its class is not in `NON_BATCHABLE_CONTRADICTION_CLASSES`, so its
 *     `variableIds` names every variable that could change whether it holds
 *     (thirteenth-wave Finding 4 batched only two such classes by name;
 *     every class now qualifies except the three documented above); and
 *   - no earlier member of the batch already claimed any of its
 *     `variableIds`, so the batch's variable-id sets are pairwise disjoint —
 *     two repairs in the batch can never have been computed from rules the
 *     other one is about to strip.
 *
 * This is what keeps genuinely interdependent contradictions safe even
 * within a single batchable class: a contradiction whose `variableIds`
 * overlaps an already-claimed set is simply left for a later pass, where it
 * is re-analysed fresh against the post-strip state (e.g. `A sameAs B` plus
 * `A differentFrom B` plus `A greaterThanVariable B` reports both a
 * `conflictingReferencePair` and a `sameAsGroupConflict` over the same
 * `{A, B}` — only the first-encountered one joins this pass's batch).
 *
 * An empty result means nothing was safely batchable and the caller falls
 * back to applying the single first contradiction, exactly as before.
 */
const independentRepairs = (
  contradictions: ValidationContradiction[],
): ValidationContradiction[] => {
  const batch: ValidationContradiction[] = [];
  const claimed = new Set<string>();
  for (const contradiction of contradictions) {
    if (NON_BATCHABLE_CONTRADICTION_CLASSES.has(contradiction.class)) {
      continue;
    }
    if (contradiction.variableIds.some((id) => claimed.has(id))) continue;
    for (const id of contradiction.variableIds) claimed.add(id);
    batch.push(contradiction);
  }
  return batch;
};

// full is finest, year is coarsest. Truncation is only intent-preserving when
// the ORIGINAL string is itself a fully-valid date at the picker's own
// resolution or at a strictly finer one — e.g. '2020-05-03' truncates to a
// year picker's '2020'. A value that merely happens to slice into a
// valid-looking prefix, such as '2020-01-01oops' or '2020garbage', is not a
// date at any resolution and must be deleted rather than blessed by slicing.
const DATE_RESOLUTION_RANK = { year: 0, month: 1, full: 2 } as const;
const DATE_RESOLUTIONS_FINEST_FIRST = ['full', 'month', 'year'] as const;

// The only keys `datePickerParametersSchema` (variable.ts) permits — anything
// else fails that strictObject outright.
const DATE_PICKER_KEYS = new Set(['type', 'min', 'max']);

/**
 * Normalises a DatePicker `parameters` record's `min`/`max` in place: real
 * dates written exactly at the picker's resolution with `min <= max`.
 * Finer-than-resolution bounds are truncated (the extra precision is
 * authored intent); anything else invalid is stripped. Used by the
 * codebook-variable DatePicker step below.
 *
 * Twenty-third-wave Finding 7: keys outside `DATE_PICKER_KEYS` are deleted
 * first, mirroring `normalizeRelativeDatePickerParameters` below. A v7
 * DatePicker record could carry a stray key from elsewhere in the codebook —
 * e.g. a RelativeDatePicker `anchor` left over from a component switch — and
 * `datePickerParametersSchema` is a strictObject, so one unrecognised key
 * failed the whole object and blocked the protocol from being imported at
 * all, even though `min`/`max` were otherwise valid. This runs after the
 * caller has already chosen this normaliser over the relative one (the
 * componentless-inference routing above), so stripping a relative-only key
 * here cannot change which normaliser a mixed-key record was routed to.
 *
 * `type` itself is normalised next: `datePickerParametersSchema` only accepts
 * 'full'/'month'/'year' (or omitted, defaulting to 'full'). A legacy value
 * outside that set — e.g. a 'week' resolution a later app version once
 * offered — is treated as 'full' for the bounds logic below, but the stray
 * value must be deleted rather than left in place, or the post-migration
 * document fails the enum check the bounds logic already assumed passed.
 */
const normalizeDatePickerParameters = (
  parameters: Record<string, unknown>,
): void => {
  for (const key of Object.keys(parameters)) {
    if (!DATE_PICKER_KEYS.has(key)) delete parameters[key];
  }
  if (
    parameters.type !== undefined &&
    parameters.type !== 'month' &&
    parameters.type !== 'year' &&
    parameters.type !== 'full'
  ) {
    delete parameters.type;
  }
  const resolution =
    parameters.type === 'month' || parameters.type === 'year'
      ? parameters.type
      : 'full';
  for (const bound of ['min', 'max'] as const) {
    const value = parameters[bound];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      delete parameters[bound];
      continue;
    }
    const matchedResolution = DATE_RESOLUTIONS_FINEST_FIRST.find((candidate) =>
      isValidDateAtResolution(value, candidate),
    );
    if (
      matchedResolution === undefined ||
      DATE_RESOLUTION_RANK[matchedResolution] < DATE_RESOLUTION_RANK[resolution]
    ) {
      delete parameters[bound];
      continue;
    }
    const truncated = value.slice(0, DATE_RESOLUTION[resolution].length);
    // Eighth-wave Finding 2: at year/month resolution the interview runtime
    // builds selectable year options via unpadded `y.toString()`, so a
    // zero-padded small-year bound ('0099') can never match a stored value
    // ('99') — such a bound is deleted rather than truncated-and-kept. Full
    // resolution is unaffected: its YYYY-MM-DD strings are always padded.
    if (resolution !== 'full' && Number(truncated.slice(0, 4)) < 1000) {
      delete parameters[bound];
      continue;
    }
    // Eleventh-wave Finding 1: at full resolution the native HTML date input
    // starts at year 0001, so a year-zero bound (a real ISO date — JS Date
    // supports year 0) can never be satisfied by any selectable value and is
    // stripped like the other unusable bounds above. Years 0001-0999 are kept
    // (the deliberate full-resolution small-year support).
    if (resolution === 'full' && Number(truncated.slice(0, 4)) === 0) {
      delete parameters[bound];
      continue;
    }
    parameters[bound] = truncated;
  }
  if (
    typeof parameters.min === 'string' &&
    typeof parameters.max === 'string' &&
    parameters.min > parameters.max
  ) {
    delete parameters.min;
    delete parameters.max;
  }
};

// The only keys `relativeDatePickerParametersSchema` (variable.ts) permits —
// anything else fails that strictObject outright.
const RELATIVE_DATE_PICKER_KEYS = new Set(['anchor', 'before', 'after']);

/**
 * Normalises a RelativeDatePicker `parameters` record in place, mirroring
 * `normalizeDatePickerParameters` above: a real ISO `anchor` date (the shared
 * `isIsoDate`) whose year is inside the native date input's range,
 * non-negative integer
 * `before`/`after` offsets, and only those three keys — the schema is a
 * strictObject, so one unrecognised key fails the whole object rather than
 * just itself. Tenth-wave Finding 4: used by the codebook-variable datetime
 * step below, which previously skipped RelativeDatePicker variables entirely,
 * so a loose v7 parameters record (e.g. an anchor like '0500-01-01') migrated
 * into a document the v8 schema rejects on import.
 */
const normalizeRelativeDatePickerParameters = (
  parameters: Record<string, unknown>,
): void => {
  for (const key of Object.keys(parameters)) {
    if (!RELATIVE_DATE_PICKER_KEYS.has(key)) delete parameters[key];
  }
  if (typeof parameters.anchor !== 'string' || !isIsoDate(parameters.anchor)) {
    delete parameters.anchor;
  } else if (Number(parameters.anchor.slice(0, 4)) === 0) {
    // The native date input starts at year 0001. Removing an earlier anchor
    // reverts the picker to its interview-date default.
    delete parameters.anchor;
  }
  for (const bound of ['before', 'after'] as const) {
    const value = parameters[bound];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      delete parameters[bound];
    }
  }
};

// Raw-JSON equivalent of validation-helpers.ts's `getVariablesForSubject`,
// used by migration steps that run on unparsed v7 input rather than a typed
// Codebook.
const codebookVariablesForSubject = (
  codebook: unknown,
  subject: unknown,
): Record<string, unknown> => {
  const cb = asRecord(codebook);
  const subj = asRecord(subject);
  if (!cb || !subj) return {};
  if (subj.entity === 'ego') {
    return asRecord(asRecord(cb.ego)?.variables) ?? {};
  }
  if (
    (subj.entity === 'node' || subj.entity === 'edge') &&
    typeof subj.type === 'string'
  ) {
    return (
      asRecord(asRecord(asRecord(cb[subj.entity])?.[subj.type])?.variables) ??
      {}
    );
  }
  return {};
};

const codebookVariable = (
  codebook: unknown,
  subject: unknown,
  variableId: unknown,
): Record<string, unknown> | null => {
  if (typeof variableId !== 'string') return null;
  return asRecord(codebookVariablesForSubject(codebook, subject)[variableId]);
};

const codebookVariableName = (
  codebook: unknown,
  subject: unknown,
  variableId: unknown,
): string | undefined => {
  const name = codebookVariable(codebook, subject, variableId)?.name;
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
};

// Resolves whether a specific rule operand targets a categorical variable, scoped
// to the rule's own entity. A flat codebook-wide id set would mis-handle the case
// where two entities (or node/edge types) share an attribute id but only one
// definition is categorical, rewriting non-categorical operands to arrays. The
// rule carries its scope: `rule.type` ('node'|'edge'|'ego') and, for node/edge,
// `rule.options.type` (the entity type), so we look the variable up there.
const isCategoricalRuleAttribute = (
  codebook: unknown,
  ruleType: unknown,
  entityType: unknown,
  attribute: string,
): boolean => {
  const typedCodebook = asRecord(codebook);
  if (!typedCodebook) return false;

  let variables: Record<string, unknown> | null = null;
  if (ruleType === 'ego') {
    variables = asRecord(asRecord(typedCodebook.ego)?.variables);
  } else if (
    (ruleType === 'node' || ruleType === 'edge') &&
    typeof entityType === 'string'
  ) {
    const entities = asRecord(typedCodebook[ruleType]);
    variables = asRecord(asRecord(entities?.[entityType])?.variables);
  }

  if (!variables) return false;
  return asRecord(variables[attribute])?.type === 'categorical';
};

const migrationV7toV8 = createMigration({
  from: 7,
  to: 8,
  dependencies: { name: '' },
  notes: `
- New interface: "geospatial interface". Allows the participant to select a location on a map based on a geojson shapefile.
- New experimental interface: "anonymisation interface". Allows the participant to encrypt sensitive/identifiable information, so that it cannot be read by the researcher. Not enabled by default. Contact the team for details.
- New interface: "one-to-many dyad-census". Allows the participant to link multiple alters at a time.
- New interface: "family pedigree". A pedigree building interface designed for genetic disease monitoring scenarios, with configurable node and edge types, relationship attributes, and optional disease/condition nomination prompts.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Add optional targeted skip-logic destinations. When a stage is hidden, routing can continue at the next available stage, jump to a later stage, or continue to the interview finish screen.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical attributes to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
- Removed 'options' property for boolean Toggle attributes. This property was not used.
- A boolean attribute's \`options\` must now offer at least one choice. An empty list rendered a control with no buttons at all, which a participant could never answer; the empty list is removed so the attribute falls back to the standard Yes/No choices.
- Changed FilterRule type to use the same entity names as elsewhere
- Added 'name' property to protocol (required dependency for migration)
- Renamed 'iconVariant' to 'icon' on node definitions.
- Added 'shape' property with default 'circle' to all node definitions.
- Added optional 'hint' property to form fields, allowing a markdown string to be displayed as additional guidance for participants.
- Added optional 'showValidationHints' property to form fields, enabling automatic display of hints derived from validation rules.
- Removed 'loop' property from Information stage items and video/audio assets. This property was never honoured by Interviewer.
- Removed the \`minValue\` and \`maxValue\` validators from scalar (visual analog scale) attributes. A scalar response is recorded on a normalised 0-1 scale, so a value bound on it was never meaningful. Any such validator is removed.
- A \`minValue\`, \`minLength\`, or \`minSelected\` validator no longer implies a field is required. To preserve the effective behaviour of existing protocols that relied on this coupling, any codebook attribute (node, edge, or ego) with one of these validators and no explicit \`required: true\` now has \`required: true\` set.
- Categorical attribute values are now stored as arrays of selected option values. Existing single-value categorical filter and skip-logic rule operands (\`is exactly\`, \`is not\`, \`includes\`, \`excludes\`) are wrapped in a single-element array to match.
- Stage labels are now required to be non-empty. Any stage with a missing or empty label is given a default name based on its position (e.g. "Stage 3").
- The Information stage \`title\` (page heading) is now required. Any Information stage without one is given its stage label as the title, or "Information" when no label was authored.
- The NameGenerator \`form.title\` (heading of the add-a-person dialog) is now required. Any NameGenerator form without one is given "Add {node type name}" (e.g. "Add Person").
- A codebook attribute referenced by a form field must define a \`component\` (input control). Previously this was only checked by the Architect editor; a protocol violating it crashed the interview when the form rendered.
- Several free-text fields that the Architect editor already requires are now required (non-empty) in the schema: a prompt's \`text\`, a form field's \`prompt\`, an introduction panel's \`title\` and \`text\`, an Information item's \`content\`, a Narrative preset's \`label\`, a side panel's \`title\`, a NameGeneratorRoster \`dataSource\`, and its \`searchOptions.matchProperties\` (at least one). Any that were empty are backfilled — the form-field prompt from the attribute's name, the panel title from the stage label, a preset/side-panel label by position — else a plain default. An empty \`searchOptions\`, and an Information asset item with no asset id (a broken reference), are dropped. (The FamilyPedigree \`censusPrompt\`, NarrativePedigree disease \`label\`/\`color\`, and Anonymisation \`explanationText\` are likewise required but are v8-only, so no migration is needed.)
- The Sociogram and Narrative \`background\` is now required and must be exactly one of its two variants: an image (\`image\` set, no \`concentricCircles\`) or concentric circles (\`concentricCircles\` set to a whole number, no \`image\`; 0 renders no rings). Stages with no background, or with an incomplete or contradictory one, are normalised: an image wins when present; otherwise \`concentricCircles\` defaults to 4, matching what the interview already rendered.
- An OrdinalBin prompt \`color\` is now required, restricted to the ten \`ord-color-seq-1\`–\`ord-color-seq-10\` palette values the interface can render. Any other value was silently ignored and is removed; prompts without a valid color default to the first palette color (\`ord-color-seq-1\`), the runtime's previous fallback.
- A CategoricalBin prompt \`otherOptionLabel\` or \`otherVariablePrompt\` without an accompanying \`otherVariable\` was silently ignored, as was an empty-string \`otherVariable\`. Such orphaned properties are removed.
- A CategoricalBin prompt with \`otherVariable\` set now requires both \`otherVariablePrompt\` and \`otherOptionLabel\` (previously a missing label silently dropped the whole "other" bin). A missing value is backfilled from the other authored one, else "Please specify" / "Other".
- A CategoricalBin prompt's \`otherVariable\` must reference a text attribute because its follow-up control records text. A non-text reference and its associated "other" configuration are removed.
- A Sociogram prompt with \`highlight.allowHighlighting\` enabled must name the boolean attribute to toggle, and an \`edges\` object must set \`create\` and/or \`display\`. Prompts violating either were runtime no-ops; the highlight toggle is turned off and the empty edges object removed.
- The Sociogram and Narrative \`automaticLayout\` behaviour is now a plain boolean (previously \`{ enabled }\`); existing values are flattened. The Narrative interface gains this behaviour for the first time; it is only active when explicitly enabled, so existing Narrative stages keep their hand-authored static positions.
- Validation rules that contradict each other are removed so existing protocols stay valid under the new schema checks: inverted \`min\`/\`max\` pairs (both removed), \`required\` text or categorical attributes whose maximum is zero (the zero maximum is removed), \`minSelected\` above the option count, \`sameAs\` and \`differentFrom\` naming one target (both removed), comparator structures no value can satisfy — impossible cycles, comparisons inside a \`sameAs\` group, comparisons whose value ranges cannot overlap (the comparator is removed; value bounds are kept), \`sameAs\` groups whose bounds share no value (the \`sameAs\` rules are removed) — and validation references to an attribute of a different type. Count-valued rules must be non-negative; negative values are removed.
- DatePicker \`min\`/\`max\` parameters must be real dates written exactly at the picker's resolution, with \`min\` not after \`max\`. Values with more precision than the resolution are truncated; other invalid values are removed. At year or month resolution, a bound must use a four-digit year of 1000 or later — the interview builds that resolution's year options unpadded, so an earlier, zero-padded year could never match a stored value; such a bound is removed. Any parameter key other than \`type\`, \`min\`, or \`max\` — e.g. a RelativeDatePicker \`anchor\` left over from a component switch — is also removed.
- A datetime codebook attribute's RelativeDatePicker \`anchor\` must be a real date inside the native input's year range of 0001–9999, and its \`before\`/\`after\` offsets must be non-negative whole numbers of days. Invalid values, and any unrecognised parameter, are removed; a removed anchor reverts the picker to its interview-date default.
- A datetime attribute's \`parameters\` must be a plain object; a wrong-typed value (a string, number, list, or null) is removed, reverting the picker to its defaults.
- Validation rules the new schema cannot express are removed: rule names it has never defined, rules whose value has the wrong type (e.g. a quoted number), and rules that do not apply to the attribute's type (e.g. \`minValue\` on a text attribute, or \`requiredAcceptsNull\` anywhere). A removed \`minValue\`/\`minLength\`/\`minSelected\` still marks the attribute required, preserving the old implied-required behaviour. Layout attributes take no validation at all; theirs is removed.
- An attribute's \`component\` (input control) must be one its type can render. An unrecognised or mismatched control is replaced with the type's standard control (for datetime, chosen by the shape of its \`parameters\`); layout attributes, which have no control, have it removed.
- Ordinal and categorical option values must be strings or whole numbers; a fractional value is converted to its string form (as legacy boolean values already are), and a numeric option label becomes the same text it already displayed. A boolean attribute's option entry that is not a labelled true/false choice is removed; if no entries remain the attribute falls back to the standard Yes/No choices.
- The CategoricalBin "other" input and the NameGenerator quick-add field now honour the referenced attribute's configured validation. Both previously required a response locally, so migration adds \`required: true\` to every attribute they reference while preserving its other validation rules.
- A form may no longer collect the same attribute twice. Two fields naming one attribute always shared a single answer — whichever the participant filled in last overwrote the other — so the repeat was never collecting anything of its own. Only the first field for each attribute is kept.
`,
  migrate: (doc, deps) => {
    const codebook = (doc as Record<string, unknown>).codebook;

    const transformed = traverseAndTransform(doc as Record<string, unknown>, [
      {
        // Remove deprecated 'displayVariable' property from node and edge entity definitions
        paths: ['codebook.node.*', 'codebook.edge.*'],
        fn: <V>(entityDefinition: V) => {
          if (
            typeof entityDefinition === 'object' &&
            entityDefinition !== null
          ) {
            const typedEntity = entityDefinition as Record<string, unknown>;
            delete typedEntity.displayVariable;
          }
          return entityDefinition;
        },
      },
      {
        // Remove 'options' property from Toggle boolean variables, and from
        // any boolean variable whose options are an EMPTY array
        // (thirteenth-wave Finding 2): the interview's BooleanField falls back
        // to its Yes/No default only when no options are supplied at all, so
        // an empty array rendered a control with no buttons — unanswerable,
        // and fatal on a required variable. Deleting the property restores
        // that default. This must stay ahead of the contradiction fixpoint
        // below, whose boolean-domain reasoning now treats an explicitly
        // empty options array as offering no value.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;

          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable === 'object' && variable !== null) {
              const typedVariable = variable as Record<string, unknown>;
              if (typedVariable.type !== 'boolean') continue;
              // A malformed entry (non-boolean value, non-string label, or a
              // wrong-typed `negative` flag) fails v8's boolean options
              // schema and has no faithful per-entry repair — the value IS
              // the datum stored — so the entry is dropped. An options array
              // this leaves empty falls through to the empty-array deletion
              // below, restoring the runtime's Yes/No default.
              if (Array.isArray(typedVariable.options)) {
                typedVariable.options = typedVariable.options.filter(
                  (option) => {
                    const typedOption = asRecord(option);
                    return (
                      typedOption !== null &&
                      typeof typedOption.label === 'string' &&
                      typeof typedOption.value === 'boolean' &&
                      (typedOption.negative === undefined ||
                        typeof typedOption.negative === 'boolean')
                    );
                  },
                );
              }
              if (
                typedVariable.component === 'Toggle' ||
                (Array.isArray(typedVariable.options) &&
                  typedVariable.options.length === 0)
              ) {
                delete typedVariable.options;
              }
            }
          }
          return variables;
        },
      },
      {
        // Ego variables cannot carry the `unique` validation (the interview's
        // unique check throws for the ego entity). Strip it from existing ego
        // protocols so they validate.
        paths: ['codebook.ego.variables'],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable !== 'object' || variable === null) continue;
            const validation = (variable as Record<string, unknown>).validation;
            if (typeof validation === 'object' && validation !== null) {
              delete (validation as Record<string, unknown>).unique;
            }
          }
          return variables;
        },
      },
      {
        // V7's loose validation object admits shapes v8's `validations`
        // record cannot express at all: rule keys v8 has never defined (e.g.
        // a hand-added `pattern` or `minWords`) and known rules whose value
        // is the wrong primitive type (a string `minLength`, a numeric
        // `required`, a numeric reference target). Either fails the v8
        // strictObject outright, blocking the import. Delete them here —
        // BEFORE any step that infers meaning from a rule's mere presence
        // (the ordinal minSelected strip and the min-implies-required
        // backfill), so a garbage value never fabricates requiredness.
        // Layout and location variables take no validation at all in v8
        // (their rule set is empty), so their whole `validation` object is
        // removed.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          const typedVariables = asRecord(variables);
          if (!typedVariables) return variables;
          for (const variable of Object.values(typedVariables)) {
            const typedVariable = asRecord(variable);
            if (!typedVariable) continue;
            const validation = asRecord(typedVariable.validation);
            if (!validation) continue;
            const type = typedVariable.type;
            const rules =
              typeof type === 'string'
                ? VALIDATION_RULES_BY_TYPE[type]
                : undefined;
            if (rules && Object.keys(rules).length === 0) {
              delete typedVariable.validation;
              continue;
            }
            for (const [rule, value] of Object.entries(validation)) {
              if (BOOLEAN_VALUED_VALIDATIONS.has(rule)) {
                if (typeof value !== 'boolean') delete validation[rule];
              } else if (NUMBER_VALUED_VALIDATIONS.has(rule)) {
                if (typeof value !== 'number') delete validation[rule];
              } else if (REFERENCE_VALUED_VALIDATIONS.has(rule)) {
                if (typeof value !== 'string') delete validation[rule];
              } else {
                delete validation[rule];
              }
            }
          }
          return variables;
        },
      },
      {
        // CategoricalBin's "other" dialog and NameGenerator quick-add both
        // required a response locally in v7. Their v8 writers now honour the
        // referenced variable's codebook validation, so carry that effective
        // requiredness into the variable itself. This intentionally overrides
        // an explicit legacy `required: false`: the writer never honoured it.
        // Run before validation-contradiction repair so the normal v8 policy
        // can resolve any newly explicit required/max-zero conflict.
        paths: [''],
        fn: <V>(document: V) => {
          const typedDocument = asRecord(document);
          if (!typedDocument || !Array.isArray(typedDocument.stages)) {
            return document;
          }

          const markRequired = (subject: unknown, variableId: unknown) => {
            const variable = codebookVariable(
              typedDocument.codebook,
              subject,
              variableId,
            );
            if (!variable || variable.type !== 'text') return;
            const validation = asRecord(variable.validation);
            if (validation) {
              validation.required = true;
            } else {
              variable.validation = { required: true };
            }
          };

          for (const rawStage of typedDocument.stages) {
            const stage = asRecord(rawStage);
            if (!stage) continue;
            if (
              stage.type === 'CategoricalBin' &&
              Array.isArray(stage.prompts)
            ) {
              for (const rawPrompt of stage.prompts) {
                markRequired(stage.subject, asRecord(rawPrompt)?.otherVariable);
              }
            } else if (stage.type === 'NameGeneratorQuickAdd') {
              markRequired(stage.subject, stage.quickAdd);
            }
          }

          return document;
        },
      },
      {
        // A variable's `component` (input control) must be one its own type
        // can render — the v8 variable union has no member pairing e.g.
        // `text` with `Number`, so a hand-edited or legacy pairing fails
        // every union member and blocks the import. Replace an unrecognised
        // or mismatched control with the type's standard one (the first
        // `VARIABLE_TYPE_COMPONENTS` entry; for datetime, chosen by the
        // parameters shape so the DatePicker/RelativeDatePicker routing
        // below sees a consistent pairing). Layout and location variables
        // have no participant-facing control at all, so theirs is removed.
        // Replacing rather than deleting matters for form-referenced
        // variables: a componentless variable in a form field is rejected by
        // the pre-existing form-field component check.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          const typedVariables = asRecord(variables);
          if (!typedVariables) return variables;
          for (const variable of Object.values(typedVariables)) {
            const typedVariable = asRecord(variable);
            if (!typedVariable || !('component' in typedVariable)) continue;
            const type = typedVariable.type;
            if (typeof type !== 'string') continue;
            const legal = COMPONENTS_BY_TYPE[type];
            if (!legal) continue;
            const component = typedVariable.component;
            if (typeof component === 'string' && legal.includes(component)) {
              continue;
            }
            if (legal.length === 0) {
              delete typedVariable.component;
              continue;
            }
            if (type === 'datetime') {
              const parameters = asRecord(typedVariable.parameters);
              typedVariable.component =
                parameters && isRelativeDatePickerShape(parameters)
                  ? 'RelativeDatePicker'
                  : 'DatePicker';
              continue;
            }
            typedVariable.component = legal[0];
          }
          return variables;
        },
      },
      {
        // Ordinal is single-select, so the array-valued minSelected/maxSelected
        // validators no longer apply. Strip them from ordinal variables on any
        // entity (categorical keeps them).
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable !== 'object' || variable === null) continue;
            const typedVariable = variable as Record<string, unknown>;
            if (typedVariable.type !== 'ordinal') continue;
            const validation = typedVariable.validation;
            if (typeof validation === 'object' && validation !== null) {
              const typedValidation = validation as Record<string, unknown>;
              // `minSelected` implied the field was required in older protocols.
              // The later min*->required step runs after this strip and so will
              // not see minSelected once removed, so preserve that coupling here.
              if (
                'minSelected' in typedValidation &&
                typedValidation.required !== true
              ) {
                typedValidation.required = true;
              }
              delete typedValidation.minSelected;
              delete typedValidation.maxSelected;
            }
          }
          return variables;
        },
      },
      {
        // Ordinal/categorical option values are strings or integers in v8;
        // booleans are no longer selectable. Coerce any legacy boolean option
        // value to its string form. Boolean-variable options legitimately use
        // booleans and are left untouched.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable !== 'object' || variable === null) continue;
            const typedVariable = variable as Record<string, unknown>;
            if (
              typedVariable.type !== 'ordinal' &&
              typedVariable.type !== 'categorical'
            ) {
              continue;
            }
            const options = typedVariable.options;
            if (!Array.isArray(options)) continue;
            for (const option of options) {
              if (typeof option !== 'object' || option === null) continue;
              const typedOption = option as Record<string, unknown>;
              if (typeof typedOption.value === 'boolean') {
                typedOption.value = typedOption.value ? 'true' : 'false';
              } else if (
                typeof typedOption.value === 'number' &&
                !Number.isInteger(typedOption.value)
              ) {
                // V8 option values are strings or integers. A v7-legal
                // fractional value (e.g. a 0.5-step Likert option) is
                // coerced to its string form, exactly as booleans are above.
                typedOption.value = String(typedOption.value);
              }
              if (typeof typedOption.label === 'number') {
                // Labels are display strings in v8; a numeric label keeps
                // its rendered text.
                typedOption.label = String(typedOption.label);
              }
            }
          }
          return variables;
        },
      },
      {
        // `encrypted` is only meaningful on node TEXT variables. Strip it from
        // every non-text node variable.
        paths: ['codebook.node.*.variables'],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable !== 'object' || variable === null) continue;
            const typedVariable = variable as Record<string, unknown>;
            if (typedVariable.type !== 'text') {
              delete typedVariable.encrypted;
            }
          }
          return variables;
        },
      },
      {
        // Ego and edge variables can never be encrypted; strip `encrypted`
        // regardless of variable type.
        paths: ['codebook.edge.*.variables', 'codebook.ego.variables'],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable === 'object' && variable !== null) {
              delete (variable as Record<string, unknown>).encrypted;
            }
          }
          return variables;
        },
      },
      {
        // EgoForm/AlterForm/AlterEdgeForm never render form.title, so the v8
        // title-less form variant rejects it. Delete it from those stages.
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          const formStageTypes = new Set([
            'EgoForm',
            'AlterForm',
            'AlterEdgeForm',
          ]);
          if (
            typeof typedStage.type === 'string' &&
            formStageTypes.has(typedStage.type) &&
            typeof typedStage.form === 'object' &&
            typedStage.form !== null
          ) {
            delete (typedStage.form as Record<string, unknown>).title;
          }
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (typedStage.type !== 'NameGenerator') return stage;
          const form = asRecord(typedStage.form);
          if (!form) return stage;
          if (typeof form.title === 'string' && form.title.trim() !== '') {
            return stage;
          }
          const subjectType = asRecord(typedStage.subject)?.type;
          const entityName =
            typeof subjectType === 'string'
              ? asRecord(asRecord(asRecord(codebook)?.node)?.[subjectType])
                  ?.name
              : undefined;
          form.title =
            typeof entityName === 'string' && entityName.trim() !== ''
              ? `Add ${entityName}`
              : 'Add';
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (typedStage.type !== 'Information') return stage;
          if (
            typeof typedStage.title !== 'string' ||
            typedStage.title.trim() === ''
          ) {
            typedStage.title =
              typeof typedStage.label === 'string' &&
              typedStage.label.trim() !== ''
                ? typedStage.label
                : 'Information';
          }
          return stage;
        },
      },
      {
        // A CategoricalBin 'other' follow-up needs otherVariablePrompt as its
        // dialog label and otherOptionLabel as its bin caption; v8 requires
        // both when otherVariable is set. Backfill each missing one from the
        // other authored value, else a default.
        paths: ['stages[].prompts[]'],
        fn: <V>(prompt: V) => {
          if (typeof prompt !== 'object' || prompt === null) return prompt;
          const typedPrompt = prompt as Record<string, unknown>;
          if (
            typeof typedPrompt.otherVariable !== 'string' ||
            !typedPrompt.otherVariable
          ) {
            return prompt;
          }
          const authoredPrompt =
            typeof typedPrompt.otherVariablePrompt === 'string' &&
            typedPrompt.otherVariablePrompt
              ? typedPrompt.otherVariablePrompt
              : undefined;
          const authoredLabel =
            typeof typedPrompt.otherOptionLabel === 'string' &&
            typedPrompt.otherOptionLabel
              ? typedPrompt.otherOptionLabel
              : undefined;
          if (!authoredPrompt) {
            typedPrompt.otherVariablePrompt = authoredLabel ?? 'Please specify';
          }
          if (!authoredLabel) {
            typedPrompt.otherOptionLabel = authoredPrompt ?? 'Other';
          }
          return prompt;
        },
      },
      {
        // The 'other' bin only exists when otherVariable is set, so a
        // CategoricalBin otherOptionLabel/otherVariablePrompt without it was
        // silently ignored, as was an empty-string otherVariable. V8 rejects
        // the orphaned properties; drop them all.
        paths: ['stages[].prompts[]'],
        fn: <V>(prompt: V) => {
          if (typeof prompt !== 'object' || prompt === null) return prompt;
          const typedPrompt = prompt as Record<string, unknown>;
          if (
            typeof typedPrompt.otherVariable !== 'string' ||
            !typedPrompt.otherVariable
          ) {
            if (typedPrompt.otherVariable === '') {
              delete typedPrompt.otherVariable;
            }
            delete typedPrompt.otherOptionLabel;
            delete typedPrompt.otherVariablePrompt;
          }
          return prompt;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (typedStage.type !== 'OrdinalBin') return stage;
          if (!Array.isArray(typedStage.prompts)) return stage;
          for (const prompt of typedStage.prompts) {
            if (typeof prompt !== 'object' || prompt === null) continue;
            const typedPrompt = prompt as Record<string, unknown>;
            if (
              'color' in typedPrompt &&
              !VALID_ORDINAL_PROMPT_COLORS.has(typedPrompt.color)
            ) {
              delete typedPrompt.color;
            }
            if (!('color' in typedPrompt)) {
              typedPrompt.color = ordinalColorSequence[0];
            }
          }
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (
            typedStage.type !== 'Sociogram' &&
            typedStage.type !== 'Narrative' &&
            typedStage.type !== 'NetworkComposer'
          ) {
            return stage;
          }
          const source = Array.isArray(typedStage.background)
            ? {}
            : (asRecord(typedStage.background) ?? {});
          const background: Record<string, unknown> = {};
          if (typeof source.skewedTowardCenter === 'boolean') {
            background.skewedTowardCenter = source.skewedTowardCenter;
          }
          if (typeof source.image === 'string' && source.image !== '') {
            background.image = source.image;
          } else {
            const circles = source.concentricCircles;
            background.concentricCircles =
              typeof circles === 'number' &&
              Number.isInteger(circles) &&
              circles >= 0
                ? circles
                : 4;
          }
          typedStage.background = background;
          return stage;
        },
      },
      {
        paths: ['stages[].prompts[]'],
        fn: <V>(prompt: V) => {
          const typedPrompt = asRecord(prompt);
          if (!typedPrompt) return prompt;
          if (typeof typedPrompt.text !== 'string' || typedPrompt.text === '') {
            typedPrompt.text = 'Continue';
          }
          return prompt;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage) return stage;
          const form = asRecord(typedStage.form);
          const fields = form?.fields;
          if (!form || !Array.isArray(fields)) return stage;
          const subject =
            typedStage.type === 'EgoForm'
              ? { entity: 'ego' }
              : typedStage.subject;
          const renderable = fields.filter((field) => {
            const type = codebookVariable(
              codebook,
              subject,
              asRecord(field)?.variable,
            )?.type;
            return (
              typeof type !== 'string' ||
              !NON_RENDERABLE_VARIABLE_TYPES.has(type)
            );
          });
          // V8 rejects a form that names one variable twice
          // (`uniqueFormFieldVariables`), so repair the legacy protocols that
          // carry that shape rather than failing their migration. The
          // duplicate was never functional: every field registers under
          // `field.variable`, so both rows already shared one form value and
          // the later registration silently replaced the earlier — the second
          // field collected nothing of its own. Keep the first occurrence in
          // authored array order and drop the rest, which is what Architect's
          // `repairConfigurationConflicts` does for an already-v8 protocol.
          // Array position, not object key order, picks the survivor, so the
          // repair is deterministic. A field whose `variable` is not a string
          // is passed through untouched for the schema to reject as before.
          const seenVariables = new Set<string>();
          const deduplicated = renderable.filter((field) => {
            const variable = asRecord(field)?.variable;
            if (typeof variable !== 'string') return true;
            if (seenVariables.has(variable)) return false;
            seenVariables.add(variable);
            return true;
          });
          form.fields = deduplicated;
          for (const field of deduplicated) {
            const typedField = asRecord(field);
            if (!typedField) continue;
            if (
              typeof typedField.prompt !== 'string' ||
              typedField.prompt === ''
            ) {
              typedField.prompt =
                codebookVariableName(codebook, subject, typedField.variable) ??
                'Answer';
            }
          }
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage) return stage;
          const panel = asRecord(typedStage.introductionPanel);
          if (!panel) return stage;
          if (typeof panel.title !== 'string' || panel.title === '') {
            panel.title =
              typeof typedStage.label === 'string' &&
              typedStage.label.trim() !== ''
                ? typedStage.label
                : 'Introduction';
          }
          if (typeof panel.text !== 'string' || panel.text === '') {
            panel.text = 'Welcome.';
          }
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage || typedStage.type !== 'Information') return stage;
          if (!Array.isArray(typedStage.items)) return stage;
          typedStage.items = typedStage.items.filter((item) => {
            const typedItem = asRecord(item);
            if (!typedItem) return true;
            const emptyContent =
              typeof typedItem.content !== 'string' || typedItem.content === '';
            if (!emptyContent) return true;
            if (typedItem.type === 'text') {
              typedItem.content = 'Information.';
              return true;
            }
            return typedItem.type !== 'asset';
          });
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage || typedStage.type !== 'Narrative') return stage;
          if (!Array.isArray(typedStage.presets)) return stage;
          typedStage.presets.forEach((preset: unknown, index: number) => {
            const typedPreset = asRecord(preset);
            if (!typedPreset) return;
            if (
              typeof typedPreset.label !== 'string' ||
              typedPreset.label === ''
            ) {
              typedPreset.label = `Preset ${index + 1}`;
            }
          });
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage || !Array.isArray(typedStage.panels)) return stage;
          typedStage.panels.forEach((panel: unknown, index: number) => {
            const typedPanel = asRecord(panel);
            if (!typedPanel) return;
            if (
              typeof typedPanel.title !== 'string' ||
              typedPanel.title === ''
            ) {
              typedPanel.title = `Panel ${index + 1}`;
            }
          });
          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage || typedStage.type !== 'NameGeneratorRoster') {
            return stage;
          }
          const searchOptions = asRecord(typedStage.searchOptions);
          if (
            searchOptions &&
            (!Array.isArray(searchOptions.matchProperties) ||
              searchOptions.matchProperties.length === 0)
          ) {
            delete typedStage.searchOptions;
          }
          return stage;
        },
      },
      {
        // A TieStrengthCensus prompt renders negativeLabel as its decline card;
        // an empty/missing label shows a blank card. Scope the default to
        // TieStrengthCensus stages so prompts of other stage types (which have
        // no negativeLabel key) are never given a stray one.
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (typedStage.type !== 'TieStrengthCensus') return stage;
          if (!Array.isArray(typedStage.prompts)) return stage;
          for (const prompt of typedStage.prompts) {
            if (typeof prompt !== 'object' || prompt === null) continue;
            const typedPrompt = prompt as Record<string, unknown>;
            if (
              typeof typedPrompt.negativeLabel !== 'string' ||
              typedPrompt.negativeLabel.length === 0
            ) {
              typedPrompt.negativeLabel = 'No relationship';
            }
          }
          return stage;
        },
      },
      {
        // Normalise contradictory NameGenerator(QuickAdd) node-count windows:
        // maxNodes must allow at least one node and not undercut minNodes, and
        // minNodes must not be negative.
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (
            typedStage.type !== 'NameGenerator' &&
            typedStage.type !== 'NameGeneratorQuickAdd'
          ) {
            return stage;
          }
          const behaviours = typedStage.behaviours;
          if (typeof behaviours !== 'object' || behaviours === null) {
            return stage;
          }
          const typedBehaviours = behaviours as Record<string, unknown>;
          const { minNodes, maxNodes } = typedBehaviours;
          if (typeof maxNodes === 'number' && maxNodes < 1) {
            delete typedBehaviours.maxNodes;
          } else if (
            typeof maxNodes === 'number' &&
            typeof minNodes === 'number' &&
            maxNodes < minNodes
          ) {
            delete typedBehaviours.maxNodes;
          }
          if (
            typeof typedBehaviours.minNodes === 'number' &&
            typedBehaviours.minNodes < 0
          ) {
            delete typedBehaviours.minNodes;
          }
          return stage;
        },
      },
      {
        // Edge creation and highlighting are mutually exclusive tap behaviours
        // on a Sociogram prompt; when both are set edge creation wins, so drop
        // the highlight block.
        paths: ['stages[].prompts[]'],
        fn: <V>(prompt: V) => {
          if (typeof prompt !== 'object' || prompt === null) return prompt;
          const typedPrompt = prompt as Record<string, unknown>;
          const edges = typedPrompt.edges;
          const highlight = typedPrompt.highlight;
          const edgeCreate =
            typeof edges === 'object' && edges !== null
              ? (edges as Record<string, unknown>).create
              : undefined;
          const allowHighlighting =
            typeof highlight === 'object' && highlight !== null
              ? (highlight as Record<string, unknown>).allowHighlighting
              : undefined;
          if (edgeCreate && allowHighlighting) {
            delete typedPrompt.highlight;
          }
          return prompt;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (typedStage.type !== 'Sociogram') return stage;
          if (!Array.isArray(typedStage.prompts)) return stage;
          for (const prompt of typedStage.prompts) {
            const typedPrompt = asRecord(prompt);
            if (!typedPrompt) continue;
            const highlight = asRecord(typedPrompt.highlight);
            if (highlight?.allowHighlighting === true && !highlight.variable) {
              highlight.allowHighlighting = false;
            }
            const edges = asRecord(typedPrompt.edges);
            if (
              edges &&
              edges.create === undefined &&
              (edges.display === undefined ||
                (Array.isArray(edges.display) && edges.display.length === 0))
            ) {
              delete typedPrompt.edges;
            }
          }
          return stage;
        },
      },
      {
        // Information `size` is an uppercase image/asset sizing treatment.
        // Uppercase-fold legacy values, drop unknown ones, and remove `size`
        // from text items (which have no sizing treatment).
        paths: ['stages[].items[]'],
        fn: <V>(item: V) => {
          if (typeof item !== 'object' || item === null) return item;
          const typedItem = item as Record<string, unknown>;
          if (typedItem.type === 'text') {
            delete typedItem.size;
            return item;
          }
          if (typeof typedItem.size === 'string') {
            const folded = typedItem.size.toUpperCase();
            if (
              folded === 'SMALL' ||
              folded === 'MEDIUM' ||
              folded === 'LARGE'
            ) {
              typedItem.size = folded;
            } else {
              delete typedItem.size;
            }
          }
          return item;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage || !Array.isArray(typedStage.panels)) return stage;
          for (const panel of typedStage.panels) {
            const typedPanel = asRecord(panel);
            if (!typedPanel || typedPanel.dataSource === 'existing') continue;
            const filter = asRecord(typedPanel.filter);
            if (!filter || !Array.isArray(filter.rules)) continue;
            const remaining = filter.rules.filter(
              (rule) => asRecord(rule)?.type !== 'edge',
            );
            if (remaining.length === 0) {
              delete typedPanel.filter;
            } else {
              filter.rules = remaining;
            }
          }
          return stage;
        },
      },
      {
        // A filter whose rules array is empty empties (or inverts) the network
        // at runtime, and v8 requires at least one rule. Drop an empty stage or
        // panel filter; for skipLogic (whose filter is required) drop the whole
        // skipLogic block.
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;

          const hasEmptyRules = (filter: unknown): boolean =>
            typeof filter === 'object' &&
            filter !== null &&
            Array.isArray((filter as Record<string, unknown>).rules) &&
            ((filter as Record<string, unknown>).rules as unknown[]).length ===
              0;

          if (hasEmptyRules(typedStage.filter)) {
            delete typedStage.filter;
          }

          if (
            typeof typedStage.skipLogic === 'object' &&
            typedStage.skipLogic !== null &&
            hasEmptyRules(
              (typedStage.skipLogic as Record<string, unknown>).filter,
            )
          ) {
            delete typedStage.skipLogic;
          }

          if (Array.isArray(typedStage.panels)) {
            for (const panel of typedStage.panels) {
              if (
                typeof panel === 'object' &&
                panel !== null &&
                hasEmptyRules((panel as Record<string, unknown>).filter)
              ) {
                delete (panel as Record<string, unknown>).filter;
              }
            }
          }

          return stage;
        },
      },
      {
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          const typedStage = asRecord(stage);
          if (!typedStage) return stage;
          const backfillJoin = (filter: unknown) => {
            const typedFilter = asRecord(filter);
            if (!typedFilter || !Array.isArray(typedFilter.rules)) return;
            if (
              typedFilter.rules.length > 1 &&
              typedFilter.join === undefined
            ) {
              typedFilter.join = 'OR';
            }
          };
          backfillJoin(typedStage.filter);
          backfillJoin(asRecord(typedStage.skipLogic)?.filter);
          if (Array.isArray(typedStage.panels)) {
            for (const panel of typedStage.panels) {
              backfillJoin(asRecord(panel)?.filter);
            }
          }
          return stage;
        },
      },
      {
        // Change filter.type value from "alter" to "node" to match entity naming elsewhere
        paths: [
          'stages[].panels[].filter.rules[].type',
          'stages[].skipLogic.filter.rules[].type',
          'stages[].filter.rules[].type',
        ],
        fn: <V>(filterType: V) => {
          if (filterType === 'alter') return 'node' as V;
          return filterType;
        },
      },
      {
        // Categorical attributes are stored as arrays of selected option values,
        // and Architect now emits array operands for categorical rules. Wrap any
        // legacy scalar categorical operand in a single-element array so existing
        // EXACTLY/NOT/INCLUDES/EXCLUDES rules keep working. OPTIONS_* operands are
        // counts, and ordinal operands stay scalar, so neither is touched.
        paths: [
          'stages[].panels[].filter.rules[]',
          'stages[].skipLogic.filter.rules[]',
          'stages[].filter.rules[]',
        ],
        fn: <V>(rule: V): V => {
          if (typeof rule !== 'object' || rule === null) return rule;
          const typedRule = rule as Record<string, unknown>;
          const options = typedRule.options;
          if (typeof options !== 'object' || options === null) return rule;

          const typedOptions = options as Record<string, unknown>;
          const { attribute, operator, value } = typedOptions;

          if (
            typeof attribute !== 'string' ||
            typeof operator !== 'string' ||
            !CATEGORICAL_VALUE_OPERATORS.has(operator) ||
            !isCategoricalRuleAttribute(
              codebook,
              typedRule.type,
              typedOptions.type,
              attribute,
            ) ||
            value === undefined ||
            value === null ||
            Array.isArray(value)
          ) {
            return rule;
          }

          return {
            ...typedRule,
            options: { ...typedOptions, value: [value] },
          } as V;
        },
      },
      {
        // Remove top-level `filter` from stage types that don't support it in v8.
        // V7 was lax so some protocols stored filter on stages like NameGenerator; v8 is strict.
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const stagesWithoutFilter = new Set([
            'NameGenerator',
            'NameGeneratorQuickAdd',
            'NameGeneratorRoster',
            'Anonymisation',
            'Information',
            'EgoForm',
            'FamilyPedigree',
          ]);
          const typedStage = stage as Record<string, unknown>;
          if (
            typeof typedStage.type === 'string' &&
            stagesWithoutFilter.has(typedStage.type)
          ) {
            delete typedStage.filter;
          }
          return stage;
        },
      },
      {
        // Rename 'iconVariant' to 'icon' and add 'shape' to node definitions
        paths: ['codebook.node.*'],
        fn: <V>(entityDefinition: V) => {
          if (
            typeof entityDefinition === 'object' &&
            entityDefinition !== null
          ) {
            const typedEntity = entityDefinition as Record<string, unknown>;
            if ('iconVariant' in typedEntity) {
              typedEntity.icon = typedEntity.iconVariant;
              delete typedEntity.iconVariant;
            }
            typedEntity.shape = { default: 'circle' };
          }
          return entityDefinition;
        },
      },
      {
        // Remove unused 'loop' flag from Information stage items
        paths: ['stages[].items[]'],
        fn: <V>(item: V) => {
          if (typeof item === 'object' && item !== null) {
            delete (item as Record<string, unknown>).loop;
          }
          return item;
        },
      },
      {
        // Remove unused 'loop' flag from video/audio assets in the manifest
        paths: ['assetManifest.*'],
        fn: <V>(asset: V) => {
          if (typeof asset === 'object' && asset !== null) {
            delete (asset as Record<string, unknown>).loop;
          }
          return asset;
        },
      },
      {
        // Count-valued rules must be non-negative; a below-floor value (e.g.
        // minLength: -1, which v7 never enforced) is removed. This MUST run
        // before the min-implies-required
        // backfill below: that step infers requiredness from a min*
        // validator's mere presence, so a below-floor minLength/minSelected
        // still in place there would fabricate `required: true` for a rule
        // that never actually constrained anything. maxLength/maxSelected
        // don't feed that backfill, but share the same floor set, so they are
        // stripped in the same pass.
        //
        // All six numeric bound rules — these four plus minValue/maxValue —
        // carry `.int()` in v8 (validation.ts), but v7 is a `looseObject`
        // that never enforced it, so a hand-authored fractional value (e.g.
        // `minValue: 1.5`) survives untouched into v8 and fails schema
        // validation on import. minValue/maxValue have no floor of their own
        // (a number variable's range may be negative), so they run through
        // the same loop with an `undefined` floor: skip the below-floor
        // check, keep the integer check.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          const floors = {
            minLength: 0,
            maxLength: 0,
            minValue: undefined,
            maxValue: undefined,
            minSelected: 0,
            maxSelected: 0,
          } as const;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            const validation = asRecord(asRecord(variable)?.validation);
            if (!validation) continue;
            for (const [rule, floor] of Object.entries(floors)) {
              const value = validation[rule];
              if (
                typeof value === 'number' &&
                (!Number.isInteger(value) ||
                  (floor !== undefined && value < floor))
              ) {
                delete validation[rule];
              }
            }
          }
          return variables;
        },
      },
      {
        // A min* validator no longer implies the field is required, but older
        // protocols relied on that coupling to make fields de-facto mandatory.
        // Preserve their behaviour by marking such variables required. Runs
        // AFTER the below-floor count-rule strip above, so an inert
        // minLength/minSelected (already removed by then) cannot fabricate
        // requiredness.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;

          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            if (typeof variable !== 'object' || variable === null) continue;
            const validation = (variable as Record<string, unknown>).validation;
            if (typeof validation !== 'object' || validation === null) continue;

            const typedValidation = validation as Record<string, unknown>;
            const hasMinValidator =
              'minValue' in typedValidation ||
              'minLength' in typedValidation ||
              'minSelected' in typedValidation;

            if (hasMinValidator && typedValidation.required !== true) {
              typedValidation.required = true;
            }
          }
          return variables;
        },
      },
      {
        // V8 admits each validation rule only on the variable types whose
        // rule set (`VARIABLE_TYPE_VALIDATIONS`) lists it, via a strict
        // per-type pick — so a v7 rule parked on the wrong type (`minValue`
        // on text, `sameAs` on scalar, `requiredAcceptsNull` anywhere)
        // failed the pick and blocked the import. Remove every rule outside
        // the type's own set. Runs AFTER the min-implies-required backfill
        // so a min* rule that conferred requiredness in v7 keeps it,
        // matching the dedicated ordinal-minSelected and scalar-bound
        // strips; and BEFORE the contradiction fixpoint below, so the
        // analyser never reasons over rules v8 would reject wholesale.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          const typedVariables = asRecord(variables);
          if (!typedVariables) return variables;
          for (const variable of Object.values(typedVariables)) {
            const typedVariable = asRecord(variable);
            const validation = asRecord(typedVariable?.validation);
            if (!typedVariable || !validation) continue;
            const type = typedVariable.type;
            if (typeof type !== 'string') continue;
            const rules = VALIDATION_RULES_BY_TYPE[type];
            if (!rules) continue;
            for (const rule of Object.keys(validation)) {
              if (rules[rule] !== true) delete validation[rule];
            }
          }
          return variables;
        },
      },
      {
        // A scalar records a normalised 0-1 value, so V8 drops `minValue` and
        // `maxValue` from it entirely. This runs after the min-implies-required
        // backfill above, so a scalar that relied on that coupling keeps its
        // requiredness.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;

          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            const typedVariable = asRecord(variable);
            if (typedVariable?.type !== 'scalar') continue;

            const validation = asRecord(typedVariable.validation);
            if (!validation) continue;

            delete validation.minValue;
            delete validation.maxValue;
          }
          return variables;
        },
      },
      {
        // DatePicker `min`/`max` must be real dates written exactly at the
        // picker's resolution with `min <= max`. Truncate finer-than-
        // resolution date bounds — the extra precision is authored intent —
        // and strip anything else invalid. RelativeDatePicker variables get
        // the equivalent treatment (tenth-wave Finding 4): a valid
        // four-digit-year ISO `anchor`, non-negative integer offsets, and no
        // stray keys — the v8 parameters schema is a strictObject, so a loose
        // v7 record would otherwise fail validation after migration.
        // (Count-valued rule floors are stripped earlier, before the
        // min-implies-required backfill — see that step's comment for why the
        // order matters.)
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          if (!variables || typeof variables !== 'object') return variables;
          for (const variable of Object.values(
            variables as Record<string, unknown>,
          )) {
            const typedVariable = asRecord(variable);
            if (!typedVariable) continue;

            if (typedVariable.type !== 'datetime') continue;
            // A `parameters` value that is not a plain record (a string,
            // number, array, or null from a hand-edit) fails both v8
            // parameters strictObjects outright; delete it so the picker
            // falls back to its defaults. `asRecord` alone is not enough —
            // it admits arrays.
            if (
              'parameters' in typedVariable &&
              (Array.isArray(typedVariable.parameters) ||
                asRecord(typedVariable.parameters) === null)
            ) {
              delete typedVariable.parameters;
              continue;
            }
            const parameters = asRecord(typedVariable.parameters);
            if (!parameters) continue;
            // Nineteenth-wave Finding 1: `component` is OPTIONAL on both
            // datetime members, so a v7 variable can declare an
            // anchor/before/after window without naming a component (the
            // stage that renders it supplies one). Routing that to the
            // DatePicker normaliser left the relative keys untouched and the
            // v8 variable union then rejected the protocol outright — it
            // could not be imported at all. `isRelativeDatePickerShape` is
            // the analyser's own inference over the two members' disjoint
            // strictObject key sets, so both layers read such a variable the
            // same way; a record mixing keys from BOTH shapes matches neither
            // member, and keeps the pre-existing DatePicker reading.
            //
            // Audit sweep: an explicitly null `component` counts as absent,
            // as it now does for the analyser. The two layers have to move
            // together — the contradiction-strip step below runs the analyser
            // over these same raw records, so a disagreement here would strip
            // rules against a window this step then leaves un-normalised.
            if (
              typedVariable.component === 'RelativeDatePicker' ||
              (typedVariable.component == null &&
                isRelativeDatePickerShape(parameters))
            ) {
              normalizeRelativeDatePickerParameters(parameters);
            } else {
              normalizeDatePickerParameters(parameters);
            }
          }
          return variables;
        },
      },
      {
        // Strip contradictory validation-rule combinations per the
        // minimal-strip policy — the analyser names exactly the rules to
        // remove. Cross-type references go first (the analyser ignores them,
        // but the schema's reference pass rejects them). Stripping only
        // relaxes constraints, but a strip can change the next analysis (a
        // de-grouped variable regains its own bounds), so loop to a fixpoint —
        // applying only the FIRST contradiction's strips each pass, not
        // every contradiction the analyser currently reports. Two
        // contradictions can be interdependent (e.g. A sameAs B plus
        // A differentFrom B plus A greaterThanVariable B: stripping sameAs
        // and differentFrom alone already resolves the group, which un-scopes
        // greaterThanVariable from it — but that same-pass, pre-strip
        // analysis also flags greaterThanVariable as a strict comparator
        // inside the (still-intact) sameAs group and would strip it too,
        // unnecessarily). Re-analysing after each single strip lets a
        // resolved contradiction take its dependents off the list before they
        // are ever removed.
        //
        // Thirteenth-wave Finding 4, generalised: that protection is only
        // needed where contradictions CAN be interdependent. Repairs that are
        // provably independent — see `independentRepairs` — are applied
        // together in one pass instead, which takes a protocol of N
        // independently broken variables from N+1 analyser runs to 2. Only
        // `pinnedEqualDifferentFrom`, `pinnedDifferentFromParity`, and
        // `disjointBounds` (see `NON_BATCHABLE_CONTRADICTION_CLASSES`) stay
        // one-at-a-time unconditionally; every other class batches whenever
        // its `variableIds` are pairwise disjoint from the rest of the pass.
        paths: [
          'codebook.node.*.variables',
          'codebook.edge.*.variables',
          'codebook.ego.variables',
        ],
        fn: <V>(variables: V) => {
          const typedVariables = asRecord(variables);
          if (!typedVariables) return variables;

          for (const variable of Object.values(typedVariables)) {
            const typedVariable = asRecord(variable);
            const validation = asRecord(typedVariable?.validation);
            if (!typedVariable || !validation) continue;
            for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
              const target = validation[rule];
              if (typeof target !== 'string') continue;
              const targetVariable = asRecord(typedVariables[target]);
              // Dangling references are outside this step's scope; the
              // reference pass reports them as it always has.
              if (!targetVariable) continue;
              if (targetVariable.type !== typedVariable.type) {
                delete validation[rule];
              }
            }
          }

          // Each pass strips at least one rule (a contradiction's `strips`
          // tuple is never empty), so "the total number of validation-rule
          // entries across every variable, plus 1" provably bounds the loop:
          // there are at most that many rule instances in existence to strip
          // in total, and the +1 covers the final no-contradiction-found pass
          // that breaks out. Counted once, at loop start — the loop only ever
          // deletes rules, so a bound on the starting count is a bound for
          // every later pass too. Fifth-wave Finding 2: a fixed cap (formerly
          // 100) is exhausted by a protocol with more independent
          // contradictions than the cap allows; this scales with the actual
          // data instead. If a pathological protocol ever did exhaust the
          // bound regardless, any contradiction left standing is still
          // caught: the v8 schema's own `rejectValidationContradictions`
          // refinement runs on the migrated output and would surface it as a
          // normal validation failure instead of silently shipping bad data.
          const totalValidationRuleCount = Object.values(
            typedVariables,
          ).reduce<number>((count, variable) => {
            const validation = asRecord(asRecord(variable)?.validation);
            return count + (validation ? Object.keys(validation).length : 0);
          }, 0);
          const maxPasses = totalValidationRuleCount + 1;
          for (let pass = 0; pass < maxPasses; pass++) {
            const contradictions = findValidationContradictions(typedVariables);
            const [firstContradiction] = contradictions;
            if (!firstContradiction) break;
            const batch = independentRepairs(contradictions);
            for (const contradiction of batch.length > 0
              ? batch
              : [firstContradiction]) {
              for (const strip of contradiction.strips) {
                const validation = asRecord(
                  asRecord(typedVariables[strip.variableId])?.validation,
                );
                if (validation) delete validation[strip.rule];
              }
            }
          }
          return variables;
        },
      },
      {
        // The Sociogram/Narrative `automaticLayout` behaviour is now a flat
        // boolean (it was `{ enabled: boolean }`). Flatten any existing object
        // form to its `enabled` value. (The Narrative interface gains this
        // behaviour for the first time; it has no legacy value to flatten, and
        // the runtime treats an unset value as OFF, so existing Narrative stages
        // keep their hand-authored static positions without any backfill.)
        paths: ['stages[]'],
        fn: <V>(stage: V) => {
          if (typeof stage !== 'object' || stage === null) return stage;
          const typedStage = stage as Record<string, unknown>;
          if (
            typedStage.type !== 'Sociogram' &&
            typedStage.type !== 'Narrative'
          ) {
            return stage;
          }
          const behaviours = asRecord(typedStage.behaviours);
          const auto = behaviours?.automaticLayout;
          const autoRecord = asRecord(auto);
          if (autoRecord && 'enabled' in autoRecord) {
            const next = behaviours ?? {};
            next.automaticLayout = Boolean(autoRecord.enabled);
            typedStage.behaviours = next;
          }
          return stage;
        },
      },
      {
        // CategoricalBin always renders its "other" follow-up as a text input.
        // Drop legacy non-text targets before schema validation.
        paths: [''],
        fn: <V>(document: V) => {
          const typedDocument = asRecord(document);
          if (!typedDocument) return document;
          const stages = Array.isArray(typedDocument.stages)
            ? typedDocument.stages
            : [];

          for (const rawStage of stages) {
            const stage = asRecord(rawStage);
            if (
              !stage ||
              stage.type !== 'CategoricalBin' ||
              !Array.isArray(stage.prompts)
            ) {
              continue;
            }
            for (const rawPrompt of stage.prompts) {
              const prompt = asRecord(rawPrompt);
              if (!prompt || typeof prompt.otherVariable !== 'string') {
                continue;
              }
              const variable = codebookVariable(
                typedDocument.codebook,
                stage.subject,
                prompt.otherVariable,
              );
              if (variable && variable.type !== 'text') {
                delete prompt.otherVariable;
                delete prompt.otherOptionLabel;
                delete prompt.otherVariablePrompt;
              }
            }
          }
          return document;
        },
      },
      {
        // Update schema version and add experiments field
        paths: [''],
        fn: <V>(protocol: V) =>
          ({
            ...(protocol as Record<string, unknown>),
            schemaVersion: 8 as const,
            experiments: {},
          }) as V,
      },
    ]);

    // Set name from required dependency
    const result = transformed;
    result.name = deps.name;

    if (Array.isArray(result.stages)) {
      const droppableFormStageTypes = new Set([
        'EgoForm',
        'AlterForm',
        'AlterEdgeForm',
      ]);
      const removedStageIds = new Set<string>();
      const keptStages = result.stages.filter((stage: unknown) => {
        const typedStage = asRecord(stage);
        if (
          !typedStage ||
          typeof typedStage.type !== 'string' ||
          !droppableFormStageTypes.has(typedStage.type)
        ) {
          return true;
        }
        const fields = asRecord(typedStage.form)?.fields;
        if (Array.isArray(fields) && fields.length > 0) return true;
        if (typeof typedStage.id === 'string') {
          removedStageIds.add(typedStage.id);
        }
        return false;
      });
      result.stages = keptStages;

      if (removedStageIds.size > 0) {
        for (const stage of keptStages) {
          const skipLogic = asRecord(asRecord(stage)?.skipLogic);
          const destination = asRecord(skipLogic?.destination);
          if (
            skipLogic &&
            destination?.type === 'stage' &&
            typeof destination.stageId === 'string' &&
            removedStageIds.has(destination.stageId)
          ) {
            delete skipLogic.destination;
          }
        }
      }
    }

    // Backfill any missing, empty, or whitespace-only stage label with a
    // one-based positional default ("Stage 1", "Stage 2", …) so the migrated
    // protocol satisfies the stricter schema-8 `label` (now non-empty).
    const stages = result.stages;
    if (Array.isArray(stages)) {
      stages.forEach((stage: unknown, index: number) => {
        const typedStage = asRecord(stage);
        if (!typedStage) return;
        const label = typedStage.label;
        if (typeof label !== 'string' || label.trim() === '') {
          typedStage.label = `Stage ${index + 1}`;
        }
      });
    }

    return result as ProtocolDocument<8>;
  },
});

export default migrationV7toV8;
