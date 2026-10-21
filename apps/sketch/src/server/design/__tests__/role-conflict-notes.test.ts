// @vitest-environment node
//
// A conflict analyse() missed still reaches the researcher-notes screen, so a
// design that ships with it after the retry carries the warning.
import { describe, expect, it, vi } from 'vitest';

import { coverageDesign } from '../__fixtures__/cases.ts';
import { buildProtocol } from '../build.ts';
import { NOW, parseDesign } from './helpers.ts';

vi.mock('@codaco/protocol-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codaco/protocol-validation')>()),
  findVariableRoleConflicts: () => [{ variableName: 'visit_freq' }],
}));

describe('role conflicts found after compiling', () => {
  it('are listed on the researcher-notes screen', async () => {
    const r = await buildProtocol(parseDesign(coverageDesign), null, {
      now: NOW,
    });
    expect(r.retry).toBe(true);
    expect(JSON.stringify(r.protocol.stages[0])).toContain(
      'visit_freq\\" is asked in a form',
    );
  });
});
