import type { Codebook } from '@codaco/protocol-validation';

export function codebookTypeIndex(
  codebook: Codebook | undefined,
  entity: 'node' | 'edge',
  type: string | undefined,
): number | undefined {
  if (type === undefined) return undefined;
  const index = Object.keys(codebook?.[entity] ?? {}).indexOf(type);
  return index === -1 ? undefined : index;
}
