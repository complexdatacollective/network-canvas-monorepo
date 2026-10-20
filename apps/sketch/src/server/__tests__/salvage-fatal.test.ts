// @vitest-environment node
//
// Salvage that removes every stage that collects data leaves nothing worth
// shipping, so the run fails instead of returning information screens.
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
    validateProtocol: async (protocol: {
      stages: { id: string; type: string }[];
    }) => {
      const rejected = protocol.stages
        .map((s, i) =>
          s.type === 'Information' || s.id.startsWith('consent') ? -1 : i,
        )
        .filter((i) => i >= 0);
      if (!rejected.length) return actual.validateProtocol(protocol as never);
      return {
        success: false,
        error: new actual.ProtocolValidationError(
          rejected.map((i) => ({
            code: 'custom' as const,
            path: ['stages', i],
            message: 'Rejected.',
          })),
        ),
      };
    },
  };
});

describe('salvage', () => {
  it('fails the run when it removes every stage that collects data', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign), reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const outcome = await runPipeline(
      { description: friendshipDescription, provider: 'anthropic' },
      { adapters, buildOptions: { now: new Date('2026-10-20T00:00:00Z') } },
    );
    expect(outcome.status).toBe('failed');
    expect(outcome.log.tags).not.toContain('compilerBug');
    expect(outcome.result ?? null).toBeNull();
  });
});
