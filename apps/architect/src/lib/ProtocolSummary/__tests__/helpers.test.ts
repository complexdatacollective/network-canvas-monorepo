import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getCodebookIndex } from '../helpers';

type ShippedProtocol = Parameters<typeof getCodebookIndex>[0];

const loadShippedProtocol = (relativePath: string): ShippedProtocol => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(
      join(thisDir, '../../../../../../packages/protocols', relativePath),
      'utf-8',
    ),
  ) as ShippedProtocol;
};

const duplicatedStageIds = (stages: string[]) => {
  const seen = new Set<string>();
  return stages.filter((stageId) => {
    if (seen.has(stageId)) return true;
    seen.add(stageId);
    return false;
  });
};

/**
 * `Variables.tsx` renders one link per entry of `stages`, keyed by the stage
 * id. A stage that reads the same variable through more than one tagged site —
 * a prompt `variable` AND its own sort key, or a roster naming a column in
 * `cardOptions` AND `searchOptions` — must still appear ONCE: repeating the
 * link tells the researcher nothing extra, and duplicate React keys are an
 * error.
 */
describe('getCodebookIndex "Used In" stages', () => {
  it.each([
    ['development', 'development/protocol.json'],
    ['sample', 'sample/protocol.json'],
    ['all-interfaces', 'e2e/all-interfaces/protocol.json'],
  ])('lists each stage once per variable in %s', (_name, relativePath) => {
    const index = getCodebookIndex(loadShippedProtocol(relativePath));

    // Guard the guard: an empty index would satisfy the assertion below.
    expect(index.length).toBeGreaterThan(0);
    expect(index.some(({ stages }) => stages.length > 0)).toBe(true);

    const repeated = index
      .filter(({ stages }) => duplicatedStageIds(stages).length > 0)
      .map(({ id, name, stages }) => ({
        id,
        name,
        repeats: duplicatedStageIds(stages),
      }));

    expect(repeated).toEqual([]);
  });

  it('keeps every distinct reference path while collapsing the stage link', () => {
    const AGE = 'age-variable-id';
    const protocol = {
      schemaVersion: 8,
      name: 'p',
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: { [AGE]: { name: 'age', type: 'number' } },
          },
        },
      },
      stages: [
        {
          id: 'ordinal-bin-stage',
          type: 'OrdinalBin',
          label: 'Bin',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'p1',
              text: 'prompt',
              variable: AGE,
              color: 'ord-color-seq-1',
              binSortOrder: [{ property: AGE, direction: 'asc' }],
            },
          ],
        },
      ],
    } as unknown as ShippedProtocol;

    const entry = getCodebookIndex(protocol).find(({ id }) => id === AGE);

    expect(entry?.stages).toEqual(['ordinal-bin-stage']);
    // The underlying paths are NOT collapsed — both sites are real usage.
    expect(entry?.usage).toEqual([
      'stages.0.prompts.0.variable',
      'stages.0.prompts.0.binSortOrder.0.property',
    ]);
  });
});
