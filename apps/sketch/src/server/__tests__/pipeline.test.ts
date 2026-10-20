// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { JobStep } from '../../shared/api.ts';
import { messyDesign } from '../design/__fixtures__/cases.ts';
import {
  friendshipDescription,
  friendshipDesign,
  friendshipWording,
} from '../design/__fixtures__/example.ts';
import { runPipeline } from '../pipeline.ts';
import { DESIGN_SYSTEM, UNPARSEABLE_FEEDBACK } from '../prompts/design.ts';
import { reply, scriptedAdapter, STUDY_SCREENING } from './fakes.ts';

const NOW = new Date('2026-10-20T00:00:00.000Z');
const input = {
  description: friendshipDescription,
  provider: 'anthropic' as const,
  tier: 'standard' as const,
};
const buildOptions = { now: NOW };

const run = async (
  adapters: ReturnType<typeof scriptedAdapter>['adapters'],
) => {
  const progress: JobStep[][] = [];
  const outcome = await runPipeline(input, {
    adapters,
    buildOptions,
    onProgress: (steps) => {
      progress.push(steps);
    },
  });
  return { outcome, progress };
};

describe('runPipeline', () => {
  it('succeeds on the first try', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const { outcome, progress } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.result?.attempts).toBe(1);
    expect(outcome.result?.fixedIssues).toEqual([]);
    expect(outcome.result?.protocol.schemaVersion).toBe(8);
    expect(outcome.result?.summary.name).toBe(friendshipWording.protocolName);
    expect(outcome.log.protocolValid).toBe(true);
    expect(outcome.steps.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(outcome.steps[0]?.detail).toBe(STUDY_SCREENING.summary);
    expect(outcome.steps[1]?.detail).toMatch(
      /^\d+ node types?, \d+ relationships?, \d+ stages?$/,
    );
    expect(outcome.steps[4]?.detail).toBe('Passed on the first try');

    // Models per step, and the description only in the user message.
    expect(requests.map((r) => [r.schemaName, r.model])).toEqual([
      ['screening', 'claude-haiku-5-5'],
      ['study_design', 'claude-sonnet-5-5'],
      ['wording', 'claude-haiku-5-5'],
    ]);
    const design = requests[1];
    expect(design?.effort).toBe('medium');
    // The guide quotes the example study, so check the prompt is the constant.
    expect(design?.system).toBe(DESIGN_SYSTEM);
    expect(design?.messages).toHaveLength(1);
    expect(design?.messages[0]?.content).toContain(friendshipDescription);

    // Usage adds up over the three calls: 3 x (1000 in, 500 out, 2000 read).
    expect(outcome.usage).toMatchObject({
      inputTokens: 3000,
      outputTokens: 1500,
      cacheReadTokens: 6000,
    });
    // haiku: (1000*0.1 + 500*0.5 + 2000*0.01) / 1e6 = 0.00037
    // sonnet: (1000*2 + 500*10 + 2000*0.2) / 1e6 = 0.0074
    expect(outcome.usage.costUsd).toBeCloseTo(0.00037 * 2 + 0.0074, 8);

    // Progress went step by step, and the last report is all done.
    expect(progress.length).toBeGreaterThanOrEqual(10);
    expect(progress[0]?.[0]?.state).toBe('active');
    expect(progress.at(-1)?.every((s) => s.state === 'done')).toBe(true);
  });

  it('retries a bad design once, as a continuation, and ships the revision', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(messyDesign), reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const { outcome, progress } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.result?.attempts).toBe(2);
    expect(outcome.result?.fixedIssues.length).toBeGreaterThan(0);
    expect(outcome.steps[4]?.detail).toBe('Passed after one revision');

    const retry = requests.filter((r) => r.schemaName === 'study_design')[1];
    expect(retry?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(retry?.messages[1]?.content).toBe(JSON.stringify(messyDesign));
    expect(retry?.messages[2]?.content).toContain(
      'Sketch could not build your design exactly as written',
    );
    expect(
      progress.some((steps) =>
        /^Revising the design \(\d+ problems?\)$/.test(steps[1]?.detail ?? ''),
      ),
    ).toBe(true);
    expect(outcome.log.attempts).toHaveLength(2);
    expect(outcome.log.attempts[0]?.retry).toBe(true);
  });

  it('refuses text that is not a study, without designing', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [
        reply({
          isStudy: false,
          summary: '',
          refusalHint: 'Describe who you want to interview.',
        }),
      ],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('refused');
    expect(outcome.refusalHint).toBe('Describe who you want to interview.');
    expect(outcome.result).toBeNull();
    expect(requests).toHaveLength(1);
    expect(outcome.steps.map((s) => s.state)).toEqual([
      'done',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('carries on when screening itself fails', async () => {
    const { adapters } = scriptedAdapter({
      screening: [new Error('overloaded')],
      study_design: [reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const { outcome } = await run(adapters);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.log.tags).toContain('screeningFailed');
  });

  it('treats a wording failure as non-fatal', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign)],
      wording: [new Error('timeout')],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.log.tags).toContain('wordingFailed');
    expect(outcome.steps[2]).toMatchObject({ state: 'done' });
    expect(outcome.log.protocolValid).toBe(true);
    // Without wording, the design's working title names the protocol.
    expect(outcome.result?.summary.name).not.toBe(
      friendshipWording.protocolName,
    );
  });

  it('ignores wording that does not match the schema', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign)],
      wording: [reply({ protocolName: 'Only a name' })],
    });
    const { outcome } = await run(adapters);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.log.tags).toContain('wordingFailed');
  });

  it('counts unparseable or cut-off output as a failed attempt', async () => {
    const truncated = JSON.stringify(friendshipDesign).slice(0, 400);
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [
        reply(null, { rawText: truncated, stopReason: 'max_tokens' }),
        reply(friendshipDesign),
      ],
      wording: [reply(friendshipWording)],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.result?.attempts).toBe(2);
    const retry = requests.filter((r) => r.schemaName === 'study_design')[1];
    expect(retry?.messages[1]).toEqual({
      role: 'assistant',
      content: truncated,
    });
    expect(retry?.messages[2]?.content).toBe(UNPARSEABLE_FEEDBACK);
  });

  it('fails the job when both attempts are unparseable', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [
        reply(null, { rawText: 'not json' }),
        reply(null, { rawText: '', stopReason: 'refusal' }),
      ],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBeTruthy();
    expect(outcome.steps[1]?.state).toBe('failed');
    expect(requests.some((r) => r.schemaName === 'wording')).toBe(false);
    // Usage of the failed calls still counts.
    expect(outcome.usage.outputTokens).toBe(1500);
  });

  it('asks again when the first design call throws', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [new Error('socket hang up'), reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    const retry = requests.filter((r) => r.schemaName === 'study_design')[1];
    expect(retry?.messages).toHaveLength(1);
  });

  it('reports an unreachable model when both design calls throw', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [new Error('down'), new Error('still down')],
    });
    const { outcome } = await run(adapters);
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toMatch(/could not be reached/);
  });

  it('ships the first design when the revision is unusable', async () => {
    const { adapters } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(messyDesign), reply(null, { rawText: '{' })],
      wording: [reply(null, { rawText: '' })],
    });
    const { outcome } = await run(adapters);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.log.tags).toContain('firstAttemptShipped');
    expect(outcome.log.shippedIssues.length).toBeGreaterThan(0);
    expect(outcome.result?.attempts).toBe(2);
  });

  it('uses the strong design model for the strong tier', async () => {
    const { adapters, requests } = scriptedAdapter({
      screening: [reply(STUDY_SCREENING)],
      study_design: [reply(friendshipDesign)],
      wording: [reply(friendshipWording)],
    });
    await runPipeline({ ...input, tier: 'strong' }, { adapters, buildOptions });
    expect(requests[1]?.model).toBe('claude-opus-5-5');
  });
});
