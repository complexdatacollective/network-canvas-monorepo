// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { friendshipDesign } from '../__fixtures__/example.ts';
import {
  applyCritique,
  critiqueEdits,
  type Critique,
  type CritiqueEdit,
} from '../critique.ts';
import type { DesignStage, StudyDesign } from '../schema.ts';
import { parseDesign } from './helpers.ts';

const design = parseDesign(friendshipDesign);
const stage = (id: string): DesignStage => {
  const found = design.stages.find((s) => s.id === id);
  if (!found) throw new Error(`no stage ${id}`);
  return found;
};

const critique = (over: Partial<Critique>): Critique => ({
  issues: [],
  verdict: '',
  stages: [],
  removeStageIds: [],
  attributes: [],
  removeAttributes: [],
  relationships: [],
  endings: [],
  consentText: '',
  rationaleNote: '',
  ...over,
});

const edit = (
  label: string,
  apply: (d: StudyDesign) => StudyDesign,
): CritiqueEdit => ({ describe: label, apply });

const rename = (id: string, purpose: string) =>
  edit(`rename ${id}`, (d) => ({
    ...d,
    stages: d.stages.map((s) => (s.id === id ? { ...s, purpose } : s)),
  }));

describe('critique edits', () => {
  it('keeps an ending and the stage that routes to it in one edit', () => {
    const edits = critiqueEdits(
      critique({
        stages: [
          { action: 'replace', afterStageId: '', stage: stage('about_you') },
          {
            action: 'replace',
            afterStageId: '',
            stage: stage('name_friends'),
          },
        ],
        endings: [
          {
            id: 'too_young',
            outcome: 'ineligible',
            fromStageIds: ['name_friends'],
            message: '# Thank you',
          },
        ],
      }),
    );
    expect(edits.map((e) => e.describe)).toEqual([
      'stage "about_you"',
      'ending "too_young" with stage "name_friends"',
    ]);
  });

  it('skips a replacement of a stage that does not exist', async () => {
    const result = await applyCritique(
      design,
      critiqueEdits(
        critique({
          stages: [
            {
              action: 'replace',
              afterStageId: '',
              stage: { ...stage('about_you'), id: 'no_such_stage' },
            },
          ],
        }),
      ),
      () => Promise.resolve(true),
    );
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['stage "no_such_stage"']);
    expect(result.design).toBe(design);
  });

  it('applies every edit at once when the result is acceptable', async () => {
    const result = await applyCritique(
      design,
      [rename('welcome', 'A'), rename('thanks', 'B')],
      () => Promise.resolve(true),
    );
    expect(result.applied).toEqual(['rename welcome', 'rename thanks']);
    expect(result.skipped).toEqual([]);
  });

  it('retries an edit that only works after a later one', async () => {
    // The first edit is acceptable only once the second has been applied.
    const needsB = edit('needs B', (d) => ({
      ...d,
      stages: d.stages.map((s) =>
        s.id === 'welcome' ? { ...s, purpose: 'A' } : s,
      ),
    }));
    const b = rename('thanks', 'B');
    const acceptable = (d: StudyDesign) => {
      const purpose = (id: string) =>
        d.stages.find((s) => s.id === id)?.purpose;
      return Promise.resolve(
        purpose('welcome') !== 'A' || purpose('thanks') === 'B',
      );
    };
    const bad = edit('breaks it', (d) => ({ ...d, stages: [] }));
    const result = await applyCritique(design, [needsB, b, bad], (d) =>
      Promise.resolve(d.stages.length > 0).then((ok) => ok && acceptable(d)),
    );
    expect(result.applied).toEqual(['rename thanks', 'needs B']);
    expect(result.skipped).toEqual(['breaks it']);
  });
});
