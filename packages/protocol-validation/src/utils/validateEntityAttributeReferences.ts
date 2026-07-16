import type { Codebook } from '../schemas/8/schema.ts';
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

export const validateReferences = (
  codebook: Codebook,
  hits: EntityAttributeReferenceHit[],
): ReferenceIssue[] => {
  const issues: ReferenceIssue[] = [];
  for (const hit of hits) {
    if (!hit.subject) continue;
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
