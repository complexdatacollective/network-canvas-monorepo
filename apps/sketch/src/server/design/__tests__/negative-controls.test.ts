import { describe, expect, it } from 'vitest';

// @vitest-environment node
//
// The golden tests only prove something if the validator is live: each of
// these single edits to the valid example protocol must make it fail.
import {
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { readJsonFixture } from './helpers.ts';

type Stage = {
  id: string;
  type: string;
  form?: { title?: string };
  prompts?: {
    color?: string;
    highlight?: { variable: string };
  }[];
  filter?: { join?: string; rules: { id: string }[] };
};
type Protocol = { stages: Stage[] };

const stage = (p: Protocol, find: (s: Stage) => boolean): Stage => {
  const found = p.stages.find(find);
  if (!found) throw new Error('fixture stage missing');
  return found;
};

const controls: [string, (p: Protocol) => void][] = [
  [
    'an OrdinalBin prompt without a color',
    (p) => {
      delete stage(p, (s) => s.type === 'OrdinalBin').prompts?.[0]?.color;
    },
  ],
  [
    'an EgoForm with a form title',
    (p) => {
      const s = stage(p, (x) => x.type === 'EgoForm');
      s.form = { ...s.form, title: 'x' };
    },
  ],
  [
    'a highlight pointing at an ordinal variable',
    (p) => {
      const prompt = stage(p, (s) => s.type === 'Sociogram').prompts?.[2];
      if (prompt?.highlight) prompt.highlight.variable = 'person_closeness';
    },
  ],
  [
    'a two-rule filter without a join',
    (p) => {
      const { filter } = stage(p, (s) => s.id === 'drinking_together');
      const first = filter?.rules[0];
      if (filter && first) filter.rules.push({ ...first, id: 'r_x' });
    },
  ],
];

describe('negative controls', () => {
  const base = readJsonFixture('example.protocol.json') as Protocol;

  it('the unmodified example validates', async () => {
    const result = await validateProtocol(base as unknown as VersionedProtocol);
    expect(result.success).toBe(true);
  });

  it.each(controls)('%s fails validation', async (_, mutate) => {
    const protocol = structuredClone(base);
    mutate(protocol);
    expect(protocol).not.toEqual(base);
    const result = await validateProtocol(
      protocol as unknown as VersionedProtocol,
    );
    expect(result.success).toBe(false);
  });
});
