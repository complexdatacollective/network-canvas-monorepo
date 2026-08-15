import type { Codebook } from '../schemas/8/schema.ts';
import { VARIABLE_REFERENCE_VALIDATIONS } from '../schemas/8/variables/validation.ts';
import type { Protocol } from '../schemas/index.ts';
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences.ts';
import {
  getVariablesForSubject,
  variableExists,
} from './validation-helpers.ts';

export type ReferenceIssue = {
  code: 'custom';
  message: string;
  path: (string | number)[];
};

const VALIDATION_REFERENCE_RULES = new Set<string>(
  VARIABLE_REFERENCE_VALIDATIONS,
);

export const validateReferences = (
  codebook: Codebook,
  hits: EntityAttributeReferenceHit[],
): ReferenceIssue[] => {
  const issues: ReferenceIssue[] = [];
  for (const hit of hits) {
    if (!hit.subject) continue;
    // Collected for usage detection, never existence-checked — see
    // `AttributeExistence`. A roster data-source column or a sort key left
    // behind by a codebook edit must not make a protocol that has always
    // opened newly fail to.
    if (hit.existence === 'unchecked') continue;
    if (!variableExists(codebook, hit.subject, hit.variableId)) {
      issues.push({
        code: 'custom',
        message: `The variable "${hit.variableId}" does not exist in the codebook`,
        path: hit.path,
      });
      continue;
    }
    if (hit.requireType) {
      const variable = getVariablesForSubject(codebook, hit.subject)[
        hit.variableId
      ];
      if (variable && !hit.requireType.includes(variable.type)) {
        issues.push({
          code: 'custom',
          message: `The variable "${hit.variableId}" must be of type ${hit.requireType.join(' or ')}`,
          path: hit.path,
        });
      }
    }
    // A validation reference (sameAs, differentFrom, the comparators) must
    // target a variable of the same type as its source. The hit's path shape
    // identifies these: [..., 'variables', <sourceId>, 'validation', <rule>].
    const rule = hit.path[hit.path.length - 1];
    const sourceId = hit.path[hit.path.length - 3];
    if (
      hit.path[hit.path.length - 4] === 'variables' &&
      hit.path[hit.path.length - 2] === 'validation' &&
      typeof rule === 'string' &&
      VALIDATION_REFERENCE_RULES.has(rule) &&
      typeof sourceId === 'string'
    ) {
      const subjectVariables = getVariablesForSubject(codebook, hit.subject);
      const source = subjectVariables[sourceId];
      const target = subjectVariables[hit.variableId];
      if (source && target && source.type !== target.type) {
        issues.push({
          code: 'custom',
          message: `The "${rule}" rule on variable "${source.name}" must reference another ${source.type} variable, but "${target.name}" is ${target.type}`,
          path: hit.path,
        });
      }
    }
  }
  return issues;
};

export const validateEntityAttributeReferences = (
  protocol: Protocol<8>,
): ReferenceIssue[] =>
  validateReferences(
    protocol.codebook,
    collectEntityAttributeReferences(protocol),
  );
