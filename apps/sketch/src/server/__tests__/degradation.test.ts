// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { friendshipDesign } from '../design/__fixtures__/example.ts';
import { NOW, parseDesign } from '../design/__tests__/helpers.ts';
import { preflight } from '../design/build.ts';
import type { DesignStage, StudyDesign } from '../design/schema.ts';
import { addsDegradation } from '../pipeline.ts';

const design = parseDesign(friendshipDesign);
const broken: DesignStage = {
  kind: 'alterForm',
  id: 'broken',
  purpose: 'Asks about a node type that does not exist.',
  interviewerNote: '',
  skipLogic: {
    mode: 'always_show',
    whenSkipped: 'next_stage',
    match: 'all',
    conditions: [],
  },
  nodeTypeId: 'no_such_type',
  filter: { match: 'all', conditions: [] },
  attributeIds: ['x'],
};
const withBroken: StudyDesign = {
  ...design,
  stages: [...design.stages.slice(0, -1), broken, design.stages.at(-1)!],
};
const build = (d: StudyDesign) => preflight(d, { now: NOW });

describe('critic edits and degraded issues', () => {
  it('rejects an edit that fixes one problem but drops a working question', async () => {
    const baseline = await build(withBroken);
    const typo: StudyDesign = {
      ...design,
      stages: design.stages.map((s) =>
        s.kind === 'egoForm' && s.id === 'about_you'
          ? {
              ...s,
              attributeIds: s.attributeIds.map((a) =>
                a === 'age' ? 'agge' : a,
              ),
            }
          : s,
      ),
    };
    const edited = await build(typo);
    expect(
      edited.issues.filter((i) => i.severity === 'degraded').length,
    ).toBeLessThanOrEqual(
      baseline.issues.filter((i) => i.severity === 'degraded').length,
    );
    expect(addsDegradation(edited, baseline)).toBe(true);
  });

  it('accepts an edit that only removes problems', async () => {
    const baseline = await build(withBroken);
    expect(addsDegradation(await build(design), baseline)).toBe(false);
    expect(addsDegradation(baseline, baseline)).toBe(false);
  });
});
