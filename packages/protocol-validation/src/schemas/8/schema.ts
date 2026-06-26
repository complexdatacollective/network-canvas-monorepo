import { z } from 'zod';

import { collectEntityAttributeReferencesFromSchema } from '~/utils/collectEntityAttributeReferences';
import { validateReferences } from '~/utils/validateEntityAttributeReferences';
import {
  entityExists,
  filterRuleAttributeExists,
  filterRuleEntityExists,
  findDuplicateId,
  getFilterRuleVariableType,
  getVariablesForSubject,
  variableExists,
} from '~/utils/validation-helpers';

import { OperatorsByVariableType } from './filters';

// Re-export all the split schemas
export * from './assets';
export * from './codebook';
export * from './common';
export * from './filters';
export * from './stages';
export * from './variables';

// Import what we need for the ProtocolSchema
import { assetSchema } from './assets';
import { type Codebook, CodebookSchema, type NodeDefinition } from './codebook';
import { ExperimentsSchema, type FormField, type StageSubject } from './common';
import type { FilterRule } from './filters';
import { type Prompt, stageSchema } from './stages';

// Variable types that have no renderable form `component` and therefore
// cannot be referenced by a form field.
const NON_RENDERABLE_VARIABLE_TYPES = new Set(['layout', 'location']);

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

    // 1. Stage validation
    protocol.stages.forEach((stage, stageIndex) => {
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

      // Form field type validation: existence is covered by the
      // entity-attribute reference validator above; here we additionally reject
      // variables whose type cannot be rendered as a form field (layout/location).
      if ('form' in stage && stage.form?.fields) {
        stage.form.fields.forEach((field: FormField, fieldIndex: number) => {
          let subject: StageSubject | undefined;
          if (stage.type === 'EgoForm') {
            subject = { entity: 'ego' as const };
          } else if ('subject' in stage && stage.subject) {
            subject = stage.subject;
          }

          if (subject) {
            const variable = getVariablesForSubject(protocol.codebook, subject)[
              field.variable
            ];
            if (variable && NON_RENDERABLE_VARIABLE_TYPES.has(variable.type)) {
              ctx.addIssue({
                code: 'custom' as const,
                message: `Form field variable "${field.variable}" of type "${variable.type}" cannot be rendered as a form field.`,
                path: [
                  'stages',
                  stageIndex,
                  'form',
                  'fields',
                  fieldIndex,
                  'variable',
                ],
              });
            }
          }
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

          // CategoricalBin: otherOptionLabel required when otherVariable set
          if (
            'otherVariable' in prompt &&
            prompt.otherVariable &&
            !('otherOptionLabel' in prompt && prompt.otherOptionLabel)
          ) {
            ctx.addIssue({
              code: 'custom' as const,
              message:
                'otherOptionLabel is required when otherVariable is set.',
              path: [
                'stages',
                stageIndex,
                'prompts',
                promptIndex,
                'otherOptionLabel',
              ],
            });
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

      // 3e.iii.b. FamilyPedigree: introScreen.videoAssetId must resolve to a
      // manifest entry of type 'video'.
      if (
        stage.type === 'FamilyPedigree' &&
        'introScreen' in stage &&
        stage.introScreen?.videoAssetId
      ) {
        const videoAssetId = stage.introScreen.videoAssetId;
        const asset = protocol.assetManifest?.[videoAssetId];
        if (!asset) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `FamilyPedigree introScreen videoAssetId "${videoAssetId}" does not reference an asset in the manifest.`,
            path: ['stages', stageIndex, 'introScreen', 'videoAssetId'],
          });
        } else if (asset.type !== 'video') {
          ctx.addIssue({
            code: 'custom' as const,
            message: `FamilyPedigree introScreen videoAssetId "${videoAssetId}" must reference a 'video' asset, but is of type "${asset.type}".`,
            path: ['stages', stageIndex, 'introScreen', 'videoAssetId'],
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

          if (!nodeDef.variables || !(dynamic.variable in nodeDef.variables)) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `Shape mapping variable "${dynamic.variable}" is not defined in this node type's variables`,
              path: [...basePath, 'variable'],
            });
          } else {
            const variable = nodeDef.variables[dynamic.variable];
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
    }
  });

export type ProtocolSchemaV8 = z.infer<typeof ProtocolSchema>;

export default ProtocolSchema;
