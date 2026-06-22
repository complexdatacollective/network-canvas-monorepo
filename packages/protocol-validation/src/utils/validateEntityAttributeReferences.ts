import type { Protocol } from '../schemas';
import type { StageSubject } from '../schemas/8/common';
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences';

export type ReferenceIssue = {
  code: 'custom';
  message: string;
  path: (string | number)[];
};

type VariableEntry = { type: string };
type EntityEntry = { variables?: Record<string, VariableEntry> };
type ValidatableCodebook = {
  node?: Record<string, EntityEntry>;
  edge?: Record<string, EntityEntry>;
  ego?: EntityEntry;
};

const getVariables = (
  codebook: ValidatableCodebook,
  subject: StageSubject,
): Record<string, VariableEntry> => {
  if (subject.entity === 'ego') return codebook.ego?.variables ?? {};
  if (subject.entity === 'node') {
    return codebook.node?.[subject.type]?.variables ?? {};
  }
  if (subject.entity === 'edge') {
    return codebook.edge?.[subject.type]?.variables ?? {};
  }
  return {};
};

export const validateReferences = (
  codebook: ValidatableCodebook,
  hits: EntityAttributeReferenceHit[],
): ReferenceIssue[] => {
  const issues: ReferenceIssue[] = [];

  for (const hit of hits) {
    if (!hit.subject) continue;

    const variables = getVariables(codebook, hit.subject);

    if (!(hit.variableId in variables)) {
      issues.push({
        code: 'custom',
        message: `The variable "${hit.variableId}" does not exist in the codebook`,
        path: hit.path,
      });
      continue;
    }

    if (hit.requireType) {
      const variable = variables[hit.variableId];
      if (
        variable &&
        !(hit.requireType as readonly string[]).includes(variable.type)
      ) {
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
