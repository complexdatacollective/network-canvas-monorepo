import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import { validateProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';

import codebookReducer, { test } from '../codebook';

const AGE = 'c5fee926-855d-4419-b5bb-54e89010cea6';

const findAgeComponent = (codebook: Codebook): string | undefined => {
  for (const nodeType of Object.values(codebook.node ?? {})) {
    const variable = nodeType.variables?.[AGE];
    if (variable) {
      return 'component' in variable ? variable.component : undefined;
    }
  }
  return undefined;
};

describe('codebook writes against the real development protocol', () => {
  it('keeps the protocol valid when a composer edit touches a form-referenced variable', async () => {
    const protocol = structuredClone(developmentProtocol) as unknown as {
      codebook: Codebook;
    };

    expect(findAgeComponent(protocol.codebook)).toBe('Number');
    const before = await validateProtocol(protocol as never);
    expect(before.success).toBe(true);

    const codebook = codebookReducer(
      protocol.codebook,
      test.updateVariable({
        variable: AGE,
        configuration: {},
        replaceProperties: ['options', 'validation'],
      }),
    );

    expect(findAgeComponent(codebook)).toBe('Number');

    const after = await validateProtocol({ ...protocol, codebook } as never);
    expect(after.success).toBe(true);
  });
});
