import type { Codebook, ResolvedSubject } from '@codaco/protocol-validation';

export function getVariableDefinition(
  codebook: Codebook,
  subject: ResolvedSubject,
  attribute: string,
) {
  if (subject.entity === 'ego') {
    return codebook.ego?.variables?.[attribute];
  }

  return codebook[subject.entity]?.[subject.type]?.variables?.[attribute];
}
