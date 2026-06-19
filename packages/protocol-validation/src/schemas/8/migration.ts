import { createMigration, type ProtocolDocument } from '~/migration';
import { traverseAndTransform } from '~/utils/traverse-and-transform';

// Operators whose operand is a categorical option value (as opposed to a count,
// like OPTIONS_*, or a regex). Their legacy scalar operands are wrapped in a
// single-element array so categorical rules use the array contract.
const CATEGORICAL_VALUE_OPERATORS = new Set([
  'EXACTLY',
  'NOT',
  'INCLUDES',
  'EXCLUDES',
]);

// Collects the ids of every categorical variable across node, edge, and ego
// codebook entities, so rule migration can target only categorical operands.
const collectCategoricalVariableIds = (codebook: unknown): Set<string> => {
  const ids = new Set<string>();
  if (typeof codebook !== 'object' || codebook === null) return ids;
  const typedCodebook = codebook as Record<string, unknown>;

  const addFromVariables = (variables: unknown) => {
    if (typeof variables !== 'object' || variables === null) return;
    for (const [id, definition] of Object.entries(
      variables as Record<string, unknown>,
    )) {
      if (
        typeof definition === 'object' &&
        definition !== null &&
        (definition as Record<string, unknown>).type === 'categorical'
      ) {
        ids.add(id);
      }
    }
  };

  const addFromEntities = (entities: unknown) => {
    if (typeof entities !== 'object' || entities === null) return;
    for (const definition of Object.values(
      entities as Record<string, unknown>,
    )) {
      if (typeof definition === 'object' && definition !== null) {
        addFromVariables((definition as Record<string, unknown>).variables);
      }
    }
  };

  addFromEntities(typedCodebook.node);
  addFromEntities(typedCodebook.edge);
  if (typeof typedCodebook.ego === 'object' && typedCodebook.ego !== null) {
    addFromVariables((typedCodebook.ego as Record<string, unknown>).variables);
  }

  return ids;
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
`,
  migrate: (doc, deps) => {
    const categoricalVariableIds = collectCategoricalVariableIds(
      (doc as Record<string, unknown>).codebook,
    );

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
              delete (validation as Record<string, unknown>).minSelected;
              delete (validation as Record<string, unknown>).maxSelected;
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
        // A CategoricalBin 'other' follow-up needs otherVariablePrompt as its
        // dialog label. Backfill it (from otherOptionLabel, else a default) when
        // otherVariable is set but the prompt is missing.
        paths: ['stages[].prompts[]'],
        fn: <V>(prompt: V) => {
          if (typeof prompt !== 'object' || prompt === null) return prompt;
          const typedPrompt = prompt as Record<string, unknown>;
          if (
            typeof typedPrompt.otherVariable === 'string' &&
            typedPrompt.otherVariable &&
            !typedPrompt.otherVariablePrompt
          ) {
            typedPrompt.otherVariablePrompt =
              typeof typedPrompt.otherOptionLabel === 'string' &&
              typedPrompt.otherOptionLabel
                ? typedPrompt.otherOptionLabel
                : 'Please specify';
          }
          return prompt;
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
            !categoricalVariableIds.has(attribute) ||
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

    return result as ProtocolDocument<8>;
  },
});

export default migrationV7toV8;
