// @vitest-environment node
//
// compile() should never emit a stage that fails schema validation, so the
// salvage step is exercised here with a validator that rejects one stage.
import { describe, expect, it, vi } from 'vitest';

import {
  friendshipDescription,
  friendshipDesign,
  friendshipWording,
} from '../design/__fixtures__/example.ts';
import { runPipeline } from '../pipeline.ts';
import { reply, scriptedAdapter, STUDY_SCREENING } from './fakes.ts';

vi.mock('@codaco/protocol-validation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    validateProtocol: async (protocol: { stages: { id: string }[] }) => {
      const index = protocol.stages.findIndex((s) => s.id === 'wellbeing');
      if (index === -1) return actual.validateProtocol(protocol as never);
      return {
        success: false,
        error: new actual.ProtocolValidationError([
          { code: 'custom', path: ['stages', index], message: 'Rejected.' },
        ]),
      };
    },
  };
});

describe('salvage', () => {
  it('reports a stage it removed, in the notes and the log', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign), reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const outcome = await runPipeline(
      { description: friendshipDescription, provider: 'anthropic' },
      { adapters, buildOptions: { now: new Date('2026-10-20T00:00:00Z') } },
    );

    expect(outcome.status).toBe('succeeded');
    expect(outcome.log.tags).toContain('salvaged');
    const message = outcome.log.shippedIssues?.find((m) =>
      m.includes('"wellbeing"'),
    );
    expect(message).toMatch(
      /was removed because Sketch could not make it valid/,
    );
    const stages = outcome.result?.protocol.stages as {
      id: string;
      items?: { content: string }[];
    }[];
    expect(stages.some((s) => s.id === 'wellbeing')).toBe(false);
    expect(stages[0]?.items?.[0]?.content).toContain(message);
  });
});
