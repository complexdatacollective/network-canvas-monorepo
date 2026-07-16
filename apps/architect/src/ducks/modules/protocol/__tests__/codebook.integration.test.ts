import { describe, expect, it } from 'vitest';

import { validateProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';

import codebookReducer, { test } from '../codebook';

const AGE = 'c5fee926-855d-4419-b5bb-54e89010cea6';

type Vars = Record<string, { component?: string }>;
type NodeTypes = Record<string, { variables?: Vars }>;

const findAge = (codebook: { node?: NodeTypes }) => {
  for (const nodeType of Object.values(codebook.node ?? {})) {
    const found = nodeType.variables?.[AGE];
    if (found) return found;
  }
  return undefined;
};

describe('codebook writes against the real development protocol', () => {
  it('keeps the protocol valid when a composer edit touches a form-referenced variable', async () => {
    const protocol = structuredClone(developmentProtocol) as unknown as {
      codebook: { node?: NodeTypes };
    };

    expect(findAge(protocol.codebook)?.component).toBe('Number');
    const before = await validateProtocol(protocol as never);
    expect(before.success).toBe(true);

    const codebook = codebookReducer(
      protocol.codebook as never,
      test.updateVariable({
        variable: AGE,
        configuration: {},
        replaceProperties: ['options', 'validation'],
      }),
    );

    expect(findAge(codebook)?.component).toBe('Number');

    const after = await validateProtocol({ ...protocol, codebook } as never);
    expect(after.success).toBe(true);
  });
});
