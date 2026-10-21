// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { messyDesign } from '../__fixtures__/cases.ts';
import { friendshipWording } from '../__fixtures__/example.ts';
import { buildProtocol, preflight, retryFeedback } from '../build.ts';
import { buildWordingRequest } from '../feedback.ts';
import { NOW, parseDesign, readJsonFixture } from './helpers.ts';

// A deliberately broken, LLM-style design: every check fires, and the repaired
// protocol must still validate.
describe('the messy design', () => {
  const design = parseDesign(messyDesign);

  it('is repaired, retries, and still compiles to a valid protocol', async () => {
    const result = await preflight(design, { now: NOW });
    const counts = Object.fromEntries(
      (['adjusted', 'degraded', 'note'] as const).map((severity) => [
        severity,
        result.issues.filter((i) => i.severity === severity).length,
      ]),
    );
    // SPEC §8.3 says 12 / 17 / 3; the reference implementation gives 10 / 19 / 3
    // (folding participant_consent into the interview-ending gate is degraded).
    expect(counts).toEqual({ adjusted: 10, degraded: 19, note: 3 });
    expect(result.retry).toBe(true);
    expect(result.fatal).toBeNull();
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(result.protocol).toEqual(readJsonFixture('messy.protocol.json'));
  });

  it('formats the retry message the model receives', async () => {
    const result = await preflight(design, { now: NOW });
    expect(retryFeedback(result)).toMatchSnapshot();
  });

  it('lists the degraded repairs on the researcher-notes stage', async () => {
    const { protocol } = await preflight(design, { now: NOW });
    const notes = JSON.stringify(protocol.stages[0]);
    expect(notes).toContain('Changes Sketch made.');
    expect(notes).toContain('The stage was removed.');
  });

  it('stays valid when unrelated wording is overlaid', async () => {
    const result = await buildProtocol(design, friendshipWording, {
      now: NOW,
    });
    expect(result.validation.success).toBe(true);
  });

  it('asks the writer for the golden wording request', async () => {
    const { design: normalized } = await preflight(design, { now: NOW });
    expect(buildWordingRequest(normalized)).toEqual(
      readJsonFixture('messy.wording-request.json'),
    );
  });
});
