// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { friendshipDesign } from '../__fixtures__/example.ts';
import { preflight } from '../build.ts';
import type { StudyDesign } from '../schema.ts';
import { NOW, parseDesign } from './helpers.ts';

type Stage = {
  id: string;
  type: string;
  outcome?: string;
  mode?: string;
  label?: Record<string, string>;
  skipLogic?: { destination?: { type: string; stageId?: string } };
  items?: { content: Record<string, string> }[];
};

const stagesOf = (protocol: unknown) =>
  (protocol as { stages: Stage[] }).stages;

// The friendship design with a screening question that ends the interview
// for anyone not living in halls.
const screened: StudyDesign = parseDesign({
  ...friendshipDesign,
  stages: friendshipDesign.stages.map((s) =>
    s.id === 'name_friends'
      ? {
          ...s,
          skipLogic: {
            mode: 'skip_if',
            whenSkipped: 'end_interview',
            match: 'all',
            conditions: [
              {
                about: 'participant',
                typeId: '',
                attributeId: 'lives_in_halls',
                operator: 'is',
                value: 'no',
              },
            ],
          },
        }
      : s,
  ),
  endings: [
    {
      id: 'not_in_halls',
      outcome: 'ineligible',
      fromStageIds: ['name_friends'],
      message:
        '# Thank you\n\nThis study is for a different group of students.',
    },
  ],
});

describe('endings', () => {
  it('ends the interview at the ending the design names, after the normal one', async () => {
    const result = await preflight(screened, { now: NOW });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'degraded')).toEqual([]);
    const stages = stagesOf(result.protocol);
    const finishes = stages.filter((s) => s.type === 'FinishSession');
    expect(finishes.map((s) => [s.id, s.outcome, s.mode])).toEqual([
      ['finish', 'completed', 'confirmation'],
      ['consent_declined', 'ineligible', 'automatic'],
      ['ending_not_in_halls', 'ineligible', 'automatic'],
    ]);
    expect(stages.slice(-3).every((s) => s.type === 'FinishSession')).toBe(
      true,
    );
    const generator = stages.find((s) => s.id === 'name_friends');
    expect(generator?.skipLogic?.destination).toEqual({
      type: 'stage',
      stageId: 'ending_not_in_halls',
    });
    const gate = stages.find(
      (s) => s.skipLogic?.destination?.stageId === 'consent_declined',
    );
    expect(gate).toBeDefined();
  });

  it('drops an ending no stage leads to and asks for a retry', async () => {
    const result = await preflight(
      parseDesign({
        ...friendshipDesign,
        endings: [
          {
            id: 'orphan',
            outcome: 'terminated',
            fromStageIds: ['welcome'],
            message: '# Done',
          },
        ],
      }),
      { now: NOW },
    );
    expect(result.validation.success).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('ENDING_UNUSED');
    expect(result.retry).toBe(true);
    expect(
      stagesOf(result.protocol).some((s) => s.id === 'ending_orphan'),
    ).toBe(false);
  });
});

describe('language', () => {
  it('declares a language Network Canvas supplies text in, with its text', async () => {
    const result = await preflight(
      parseDesign({ ...friendshipDesign, language: 'es' }),
      { now: NOW },
    );
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    const protocol = result.protocol as unknown as {
      localization: unknown;
      stages: Stage[];
    };
    expect(protocol.localization).toEqual({
      defaultLocale: 'es',
      locales: ['es'],
    });
    const finish = protocol.stages.find((s) => s.id === 'finish');
    expect(finish?.label).toEqual({ es: 'Finalizar entrevista' });
    expect(JSON.stringify(result.protocol)).not.toContain('"en":');
  });

  it('declares a language it does not supply text in and says so in the notes', async () => {
    const result = await preflight(
      parseDesign({ ...friendshipDesign, language: 'sw' }),
      { now: NOW },
    );
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    const protocol = result.protocol as unknown as {
      localization: unknown;
      stages: Stage[];
    };
    expect(protocol.localization).toEqual({
      defaultLocale: 'sw',
      locales: ['sw'],
    });
    expect(protocol.stages[0]?.items?.[0]?.content.sw).toContain(
      'still in English',
    );
  });
});
