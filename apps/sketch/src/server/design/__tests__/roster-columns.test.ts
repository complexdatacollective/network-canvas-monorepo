// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { readRosterCsv } from '@codaco/protocol-validation';

import { coverageDesign } from '../__fixtures__/cases.ts';
import { preflight } from '../build.ts';
import { NOW, parseDesign } from './helpers.ts';

/**
 * The interview's rule for a roster heading and for every card, search and
 * sort setting (`getParentKeyByNameValue` in @codaco/interview): the value is
 * read as a variable id of the stage's node type, and failing that as a
 * variable's name. A value that is neither finds no data.
 */
const resolveVariable = (
  variables: Readonly<Record<string, { name: string }>>,
  value: string,
): string | undefined =>
  Object.hasOwn(variables, value)
    ? value
    : Object.entries(variables).find(([, v]) => v.name === value)?.[0];

describe('a compiled roster stage', () => {
  it('names columns of its data file that resolve to the subject type’s variables', async () => {
    const { protocol, assets } = await preflight(parseDesign(coverageDesign), {
      now: NOW,
    });
    const rosters = protocol.stages.flatMap((stage) =>
      stage.type === 'NameGeneratorRoster' ? [stage] : [],
    );
    expect(rosters).not.toHaveLength(0);

    for (const stage of rosters) {
      const [type] = stage.subject.types;
      const variables =
        (type === undefined ? undefined : protocol.codebook.node?.[type])
          ?.variables ?? {};
      const csv = assets.find((asset) => asset.id === stage.dataSource);
      expect(csv?.mimeType).toBe('text/csv');
      const { columns } = await readRosterCsv(csv?.content ?? '');

      const columnVariables = columns.map((column) =>
        resolveVariable(variables, column),
      );
      expect(columnVariables).not.toContain(undefined);

      const settings = [
        ...(stage.cardOptions?.additionalProperties ?? []).map(
          (p) => p.variable,
        ),
        ...(stage.searchOptions?.matchProperties ?? []),
        ...(stage.sortOptions?.sortableProperties ?? []).map((p) => p.variable),
        ...(stage.sortOptions?.sortOrder ?? []).map((rule) => rule.property),
      ].filter((value) => value !== '*');
      expect(settings).not.toHaveLength(0);

      for (const setting of settings) {
        expect(columns, `${setting} is a column of the roster`).toContain(
          setting,
        );
        const variable = resolveVariable(variables, setting);
        expect(variable, `${setting} resolves to a variable`).toBeDefined();
        expect(columnVariables).toContain(variable);
      }
    }
  });
});
