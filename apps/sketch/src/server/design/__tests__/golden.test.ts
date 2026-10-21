// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  friendshipDesign,
  friendshipWording,
} from '../__fixtures__/example.ts';
import { buildProtocol, preflight } from '../build.ts';
import { buildWordingRequest } from '../feedback.ts';
import { NOW, parseDesign, readJsonFixture, stageTypes } from './helpers.ts';

describe('the worked example (first-year friendships and drinking)', () => {
  const design = parseDesign(friendshipDesign);

  it('needs no repair and passes the preflight', async () => {
    const result = await preflight(design, { now: NOW });
    expect(result.issues).toEqual([]);
    expect(result.fatal).toBeNull();
    expect(result.validation.success).toBe(true);
    expect(result.retry).toBe(false);
  });

  it('compiles with wording to the golden schema 9 protocol, which validates', async () => {
    const result = await buildProtocol(design, friendshipWording, {
      now: NOW,
    });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(result.protocol).toEqual(readJsonFixture('example.protocol.json'));
    expect(stageTypes(result.protocol)).toMatchInlineSnapshot(`
      [
        "Information",
        "Information",
        "EgoForm",
        "EgoForm",
        "Information",
        "NameGeneratorQuickAdd",
        "Information",
        "AlterForm",
        "Information",
        "OrdinalBin",
        "CategoricalBin",
        "Information",
        "Sociogram",
        "OrdinalBin",
        "EgoForm",
        "EgoForm",
        "EgoForm",
        "Narrative",
        "Information",
        "FinishSession",
      ]
    `);
  });

  it('summarises the protocol for the result screen', async () => {
    const { summary, assets, protocol } = await buildProtocol(
      design,
      friendshipWording,
      { now: NOW },
    );
    expect(summary.name).toBe('First-Year Friendships and Drinking');
    expect(summary.stageCount).toBe(protocol.stages.length);
    expect(summary.stages[0]).toEqual({
      label: 'Researcher notes (delete before fielding)',
      type: 'Information',
    });
    expect(summary.nodeTypes).toEqual(['Person']);
    expect(summary.edgeTypes).toEqual(['Know each other']);
    expect(summary.rosterCount).toBe(0);
    expect(assets).toEqual([]);
  });

  it('asks the writer for the golden wording request', async () => {
    const { design: normalized } = await preflight(design, { now: NOW });
    expect(buildWordingRequest(normalized)).toEqual(
      readJsonFixture('example.wording-request.json'),
    );
  });

  it('keeps validated instrument items out of the wording request', async () => {
    const { design: normalized } = await preflight(design, { now: NOW });
    const keys = buildWordingRequest(normalized).questions.map(
      (q) => q.questionKey,
    );
    expect(keys).not.toContain('ego/audit_frequency');
    expect(keys).not.toContain('ego/who5_cheerful');
    expect(keys).toContain('ego/age');
  });
});
