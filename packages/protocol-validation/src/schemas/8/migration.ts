import {
  createMigration,
  type ProtocolDocument,
} from '../../migration/index.ts';
import { traverseAndTransform } from '../../utils/traverse-and-transform.ts';
import { ordinalColorSequence } from './common/prompts.ts';
import { NON_RENDERABLE_VARIABLE_TYPES } from './variables/types.ts';

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

const codebookVariable = (
  codebook: unknown,
  subject: unknown,
  variableId: unknown,
): Record<string, unknown> | null => {
  if (typeof variableId !== 'string') return null;
  const cb = asRecord(codebook);
  const subj = asRecord(subject);
  if (!cb || !subj) return null;
  let variables: Record<string, unknown> | null = null;
  if (subj.entity === 'ego') {
    variables = asRecord(asRecord(cb.ego)?.variables);
  } else if (
    (subj.entity === 'node' || subj.entity === 'edge') &&
    typeof subj.type === 'string'
  ) {
    variables = asRecord(
      asRecord(asRecord(cb[subj.entity])?.[subj.type])?.variables,
    );
  }
  return variables ? asRecord(variables[variableId]) : null;
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
- New interface: "family pedigree". A pedigree building interface designed for genetic disease monitoring scenarios, with configurable node and edge types, relationship variables, and optional disease/condition nomination prompts.
- Add new validation options for form fields: \`greaterThanVariable\` and \`lessThanVariable\`.
- Add new comparator options for skip logic and filter: \`contains\` and \`does not contain\`.
- Add optional targeted skip-logic destinations. When a stage is hidden, routing can continue at the next available stage, jump to a later stage, or continue to the interview finish screen.
- Amplify comparator options \`includes\` and \`excludes\` for ordinal and categorical variables to allow multiple selections.
- Removed 'displayVariable' property, if set. This property was not used, and has been marked as deprecated for a long time.
- Removed 'options' property for boolean Toggle variables. This property was not used.
- Changed FilterRule type to use the same entity names as elsewhere
- Added 'name' property to protocol (required dependency for migration)
- Renamed 'iconVariant' to 'icon' on node definitions.
- Added 'shape' property with default 'circle' to all node definitions.
- Added optional 'hint' property to form fields, allowing a markdown string to be displayed as additional guidance for participants.
- Added optional 'showValidationHints' property to form fields, enabling automatic display of hints derived from validation rules.
- Removed 'loop' property from Information stage items and video/audio assets. This property was never honoured by Interviewer.
- A \`minValue\`, \`minLength\`, or \`minSelected\` validator no longer implies a field is required. To preserve the effective behaviour of existing protocols that relied on this coupling, any codebook variable (node, edge, or ego) with one of these validators and no explicit \`required: true\` now has \`required: true\` set.
- Categorical attribute values are now stored as arrays of selected option values. Existing single-value categorical filter and skip-logic rule operands (\`is exactly\`, \`is not\`, \`includes\`, \`excludes\`) are wrapped in a single-element array to match.
- Stage labels are now required to be non-empty. Any stage with a missing or empty label is given a default name based on its position (e.g. "Stage 3").
- The Information stage \`title\` (page heading) is now required. Any Information stage without one is given its stage label as the title, or "Information" when no label was authored.
- The NameGenerator \`form.title\` (heading of the add-a-person dialog) is now required. Any NameGenerator form without one is given "Add {node type name}" (e.g. "Add Person").
- A codebook variable referenced by a form field must define a \`component\` (input control). Previously this was only checked by the Architect editor; a protocol violating it crashed the interview when the form rendered.
- Several free-text fields that the Architect editor already requires are now required (non-empty) in the schema: a prompt's \`text\`, a form field's \`prompt\`, an introduction panel's \`title\` and \`text\`, an Information item's \`content\`, a Narrative preset's \`label\`, a side panel's \`title\`, a NameGeneratorRoster \`dataSource\`, and its \`searchOptions.matchProperties\` (at least one). Any that were empty are backfilled — the form-field prompt from the variable's name, the panel title from the stage label, a preset/side-panel label by position — else a plain default. An empty \`searchOptions\`, and an Information asset item with no asset id (a broken reference), are dropped. (The FamilyPedigree \`censusPrompt\`, NarrativePedigree disease \`label\`/\`color\`, and Anonymisation \`explanationText\` are likewise required but are v8-only, so no migration is needed.)
- The Sociogram, Narrative, and NetworkComposer \`background\` is now required and must be exactly one of its two variants: an image (\`image\` set, no \`concentricCircles\`) or concentric circles (\`concentricCircles\` set to a whole number, no \`image\`; 0 renders no rings). Stages with no background, or with an incomplete or contradictory one, are normalised: an image wins when present; otherwise \`concentricCircles\` defaults to 4, matching what the interview already rendered.
- An OrdinalBin prompt \`color\` is now required, restricted to the ten \`ord-color-seq-1\`–\`ord-color-seq-10\` palette values the interface can render. Any other value was silently ignored and is removed; prompts without a valid color default to the first palette color (\`ord-color-seq-1\`), the runtime's previous fallback.
- A CategoricalBin prompt \`otherOptionLabel\` or \`otherVariablePrompt\` without an accompanying \`otherVariable\` was silently ignored, as was an empty-string \`otherVariable\`. Such orphaned properties are removed.
- A CategoricalBin prompt with \`otherVariable\` set now requires both \`otherVariablePrompt\` and \`otherOptionLabel\` (previously a missing label silently dropped the whole "other" bin). A missing value is backfilled from the other authored one, else "Please specify" / "Other".
- A Sociogram prompt with \`highlight.allowHighlighting\` enabled must name the boolean variable to toggle, and an \`edges\` object must set \`create\` and/or \`display\`. Prompts violating either were runtime no-ops; the highlight toggle is turned off and the empty edges object removed.
- The Sociogram and Narrative \`automaticLayout\` behaviour is now a plain boolean (previously \`{ enabled }\`); existing values are flattened. The Narrative interface gains this behaviour for the first time; it is only active when explicitly enabled, so existing Narrative stages keep their hand-authored static positions.
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
        // Remove 'options' property from Toggle boolean variables
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
              if (
                typedVariable.type === 'boolean' &&
                typedVariable.component === 'Toggle'
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
          form.fields = renderable;
          for (const field of renderable) {
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
        // A min* validator no longer implies the field is required, but older
        // protocols relied on that coupling to make fields de-facto mandatory.
        // Preserve their behaviour by marking such variables required.
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
      result.stages = result.stages.filter((stage: unknown) => {
        const typedStage = asRecord(stage);
        if (
          !typedStage ||
          typeof typedStage.type !== 'string' ||
          !droppableFormStageTypes.has(typedStage.type)
        ) {
          return true;
        }
        const fields = asRecord(typedStage.form)?.fields;
        return Array.isArray(fields) && fields.length > 0;
      });
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
