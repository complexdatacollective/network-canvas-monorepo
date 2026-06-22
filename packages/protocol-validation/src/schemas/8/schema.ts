import { z } from 'zod';

import { collectEntityAttributeReferencesFromSchema } from '~/utils/collectEntityAttributeReferences';
import { validateReferences } from '~/utils/validateEntityAttributeReferences';
import {
  entityExists,
  filterRuleAttributeExists,
  filterRuleEntityExists,
  findDuplicateId,
  getFilterRuleVariableType,
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
import { getAssetId } from '~/utils/mock-seeds';

import { assetSchema } from './assets';
import { CodebookSchema, type NodeDefinition } from './codebook';
import { ExperimentsSchema } from './common';
import type { FilterRule } from './filters';
import { type Prompt, stageSchema } from './stages';

const ProtocolSchema = z
  .strictObject({
    name: z.string().min(1),
    description: z.string().optional(),
    experiments: ExperimentsSchema.optional(),
    lastModified: z
      .string()
      .datetime()
      .optional()
      .generateMock(() => new Date().toISOString()),
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

      // Prompt validation (duplicate ID validation moved to individual stage schemas)
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

        stage.filter.rules.forEach((rule: FilterRule, ruleIndex: number) => {
          // Check entity exists
          if (!filterRuleEntityExists(rule, protocol.codebook)) {
            ctx.addIssue({
              code: 'custom' as const,
              message:
                rule.type === 'ego'
                  ? 'Entity type "Ego" is not defined in codebook'
                  : `Rule option type "${rule.options.type}" is not defined in codebook`,
              path: [
                'stages',
                stageIndex,
                'filter',
                'rules',
                ruleIndex,
                'options',
                'type',
              ],
            });
          }

          // Check if this is an attribute-level rule
          const hasAttribute =
            'attribute' in rule.options && rule.options.attribute;

          // Check attribute exists
          const attributeExists =
            !hasAttribute || filterRuleAttributeExists(rule, protocol.codebook);
          if (!attributeExists && hasAttribute && 'attribute' in rule.options) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `"${rule.options.attribute}" is not a valid variable ID`,
              path: [
                'stages',
                stageIndex,
                'filter',
                'rules',
                ruleIndex,
                'options',
                'attribute',
              ],
            });
          }

          // Validate operator based on variable type (only if attribute exists and is valid)
          if (hasAttribute && attributeExists) {
            const variableType = getFilterRuleVariableType(
              rule,
              protocol.codebook,
            );
            if (variableType) {
              const validOperators = OperatorsByVariableType[variableType];
              const shouldAddIssue =
                validOperators &&
                !validOperators.includes(rule.options.operator);
              if (shouldAddIssue) {
                ctx.addIssue({
                  code: 'custom' as const,
                  message: `Operator "${rule.options.operator}" is not valid for variable type "${variableType}". Valid operators: ${validOperators.join(', ')}`,
                  path: [
                    'stages',
                    stageIndex,
                    'filter',
                    'rules',
                    ruleIndex,
                    'options',
                    'operator',
                  ],
                });
              }

              // Validate value type based on operator
              if (rule.options.value !== undefined) {
                const valueType = Array.isArray(rule.options.value)
                  ? 'array'
                  : typeof rule.options.value;

                // Operators that expect numeric values for comparison
                const numericComparisonOperators = [
                  'GREATER_THAN',
                  'GREATER_THAN_OR_EQUAL',
                  'LESS_THAN',
                  'LESS_THAN_OR_EQUAL',
                ];
                // Operators that count array length (expect numeric value)
                const optionsCountOperators = [
                  'OPTIONS_GREATER_THAN',
                  'OPTIONS_LESS_THAN',
                  'OPTIONS_EQUALS',
                  'OPTIONS_NOT_EQUALS',
                ];
                // Operators that expect string values for text matching
                const stringValueOperators = ['CONTAINS', 'DOES_NOT_CONTAIN'];
                // Note: INCLUDES/EXCLUDES accept single values (string, number, boolean) or arrays
                // - they handle conversion at runtime in predicate.js

                if (
                  numericComparisonOperators.includes(rule.options.operator) &&
                  valueType !== 'number'
                ) {
                  ctx.addIssue({
                    code: 'custom' as const,
                    message: `Operator "${rule.options.operator}" requires a numeric value, but got ${valueType}`,
                    path: [
                      'stages',
                      stageIndex,
                      'filter',
                      'rules',
                      ruleIndex,
                      'options',
                      'value',
                    ],
                  });
                }

                if (
                  optionsCountOperators.includes(rule.options.operator) &&
                  valueType !== 'number'
                ) {
                  ctx.addIssue({
                    code: 'custom' as const,
                    message: `Operator "${rule.options.operator}" requires a numeric value (count), but got ${valueType}`,
                    path: [
                      'stages',
                      stageIndex,
                      'filter',
                      'rules',
                      ruleIndex,
                      'options',
                      'value',
                    ],
                  });
                }

                if (
                  stringValueOperators.includes(rule.options.operator) &&
                  valueType !== 'string'
                ) {
                  ctx.addIssue({
                    code: 'custom' as const,
                    message: `Operator "${rule.options.operator}" requires a string value, but got ${valueType}`,
                    path: [
                      'stages',
                      stageIndex,
                      'filter',
                      'rules',
                      ruleIndex,
                      'options',
                      'value',
                    ],
                  });
                }
              }
            }
          }
        });
      }

      // Check any nested filter rules recursively (for skipLogic, etc.)
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
  })
  .generateMock(() => {
    const codebook = CodebookSchema.generateMock();
    const stages = Array.from({ length: 5 }, () => stageSchema.generateMock());

    return {
      name: 'Mock Protocol',
      description: 'Generated Mock Protocol for Testing',
      schemaVersion: 8 as const,
      lastModified: new Date().toISOString(),
      experiments: {
        encryptedVariables: false,
      },
      codebook,
      assetManifest: {
        [getAssetId(0)]: assetSchema.generateMock(),
        [getAssetId(1)]: assetSchema.generateMock(),
      },
      stages,
    };
  });

export type ProtocolSchemaV8 = z.infer<typeof ProtocolSchema>;

export default ProtocolSchema;
