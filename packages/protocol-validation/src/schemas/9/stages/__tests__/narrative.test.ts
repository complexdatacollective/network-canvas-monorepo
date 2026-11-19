import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { createBaseProtocol, localized } from '../../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../../schema.ts';
import { narrativeStage } from '../narrative.ts';

const nameRule = {
  type: 'node' as const,
  id: 'rule-name',
  options: {
    type: 'person',
    attribute: 'name',
    operator: 'EXACTLY',
    value: 'Alice',
  },
};

const preset = (id: string, settings: Record<string, unknown> = {}) => ({
  id,
  label: localized(id),
  layoutVariable: 'layoutPosition',
  ...settings,
});

const stageWith = (settings: Record<string, unknown>) => ({
  id: 'narrative',
  label: localized('Narrative'),
  type: 'Narrative' as const,
  subject: { entity: 'node' as const, type: 'person' },
  background: { concentricCircles: 4 },
  presets: [preset('first'), preset('second')],
  ...settings,
});

// The base protocol with one Narrative stage after its own.
const protocolWith = (settings: Record<string, unknown>) => {
  const base = createBaseProtocol();
  return withFinishStage({
    ...base,
    stages: [...base.stages, stageWith(settings)],
  });
};

const narrativeIssues = (settings: Record<string, unknown>) => {
  const protocol = protocolWith(settings);
  const at = protocol.stages.findIndex((stage) => stage.id === 'narrative');
  return parseIssues(ProtocolSchemaV9.safeParse(protocol)).filter(({ path }) =>
    path.startsWith(`stages.${at}.`),
  );
};

describe('the filter of a Narrative preset', () => {
  it('is accepted on any preset, and differently on each', () => {
    expect(
      narrativeIssues({
        presets: [
          preset('first', { filter: { rules: [nameRule] } }),
          preset('second', {
            filter: {
              join: 'OR',
              rules: [nameRule, { ...nameRule, id: 'rule-other' }],
            },
          }),
          preset('third'),
        ],
      }),
    ).toEqual([]);
  });

  it('is refused on the stage itself', () => {
    expect(
      parseIssues(
        narrativeStage.safeParse(stageWith({ filter: { rules: [nameRule] } })),
      ),
    ).toEqual([{ path: '', code: 'unrecognized_keys', keys: ['filter'] }]);
  });

  it('is held to the codebook, at the preset that holds it', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first'),
        preset('second', {
          filter: {
            rules: [
              {
                ...nameRule,
                options: { ...nameRule.options, attribute: 'missing' },
              },
            ],
          },
        }),
      ],
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ path }) => path.includes('.presets.1.filter.rules.0')),
    ).toBe(true);
  });

  it('cannot ask about the participant, as a stage filter cannot', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first', {
          filter: {
            rules: [
              {
                type: 'ego',
                id: 'rule-ego',
                options: { attribute: 'egoName', operator: 'EXISTS' },
              },
            ],
          },
        }),
        preset('second'),
      ],
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ path }) => path.includes('.presets.0.filter.rules.0')),
    ).toBe(true);
  });

  it('cannot repeat a rule id', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first', {
          filter: { join: 'AND', rules: [nameRule, nameRule] },
        }),
        preset('second'),
      ],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'custom',
        message: 'Rules contain duplicate ID "rule-name"',
      }),
    ]);
    expect(issues[0]?.path.endsWith('.presets.0.filter.rules')).toBe(true);
  });

  it('may repeat a rule id another preset uses', () => {
    expect(
      narrativeIssues({
        presets: [
          preset('first', { filter: { rules: [nameRule] } }),
          preset('second', { filter: { rules: [nameRule] } }),
        ],
      }),
    ).toEqual([]);
  });
});
