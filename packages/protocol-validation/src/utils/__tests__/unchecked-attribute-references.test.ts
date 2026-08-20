import { describe, expect, it } from 'vitest';

import type { Protocol } from '../../schemas/index.ts';
import { collectEntityAttributeReferences } from '../collectEntityAttributeReferences.ts';
import { validateEntityAttributeReferences } from '../validateEntityAttributeReferences.ts';

/**
 * #1392: prompt sort keys and NameGeneratorRoster data-source columns hold
 * codebook variable ids, but are not GUARANTEED to. They are collected (so
 * "where is this variable used?" is complete and the Codebook's delete gate
 * agrees with it) and never existence-checked (so a protocol that has always
 * opened cannot newly fail to). See `AttributeExistence`.
 */

const NAME = 'name-variable-id';
const AGE = 'age-variable-id';
const ROSTER_ONLY = 'roster-only-variable-id';

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        [NAME]: { name: 'name', type: 'text' },
        [AGE]: { name: 'age', type: 'number' },
        [ROSTER_ONLY]: { name: 'abbreviated_name', type: 'text' },
      },
    },
  },
};

const subject = { entity: 'node', type: 'person' };

const withStages = (stages: unknown[]) =>
  ({ schemaVersion: 8, name: 'p', codebook, stages }) as unknown as Protocol<8>;

const ordinalBinWithSort = (property: string) =>
  withStages([
    {
      id: 's1',
      type: 'OrdinalBin',
      label: 'Bin',
      subject,
      prompts: [
        {
          id: 'p1',
          text: 'prompt',
          variable: AGE,
          color: 'ord-color-seq-1',
          binSortOrder: [{ property, direction: 'asc' }],
        },
      ],
    },
  ]);

const rosterStage = (matchProperty: string) =>
  withStages([
    {
      id: 's1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject,
      dataSource: 'roster_data',
      cardOptions: {
        additionalProperties: [{ label: 'Age', variable: AGE }],
      },
      sortOptions: {
        sortOrder: [{ property: NAME, direction: 'asc' }],
        sortableProperties: [{ label: 'Name', variable: NAME }],
      },
      searchOptions: { fuzziness: 0.4, matchProperties: [matchProperty] },
      prompts: [{ id: 'p1', text: 'prompt' }],
      behaviours: {},
    },
  ]);

describe('prompt sort keys', () => {
  it('collects the sort property as a stage-subject reference, unchecked', () => {
    const hits = collectEntityAttributeReferences(ordinalBinWithSort(NAME));

    expect(hits).toContainEqual(
      expect.objectContaining({
        path: ['stages', 0, 'prompts', 0, 'binSortOrder', 0, 'property'],
        variableId: NAME,
        subject: { entity: 'node', type: 'person' },
        existence: 'unchecked',
      }),
    );
  });

  it('does not collect the nomination-order key as a variable', () => {
    const sortPath = 'stages.0.prompts.0.binSortOrder.0.property';
    const pathsFor = (property: string) =>
      collectEntityAttributeReferences(ordinalBinWithSort(property)).map(
        (hit) => hit.path.join('.'),
      );

    // The site collects a real id, and stays silent for the magic key — the
    // pair is the assertion. Checking only the absence of `'*'` would pass on
    // an untagged site that collects nothing at all, which is exactly the
    // pre-#1392 source.
    expect(pathsFor(NAME)).toContain(sortPath);
    expect(pathsFor('*')).not.toContain(sortPath);
    expect(
      collectEntityAttributeReferences(ordinalBinWithSort('*')).map(
        (hit) => hit.variableId,
      ),
    ).toEqual([AGE]);
  });

  it('collects a stale sort key but does not report it', () => {
    const protocol = ordinalBinWithSort('a-stale-id');

    // Both halves matter, and neither is true by construction. Before #1392
    // the sort property was an untagged `z.string()`, so it produced no hit at
    // all — the reference was missing from the usage index AND, trivially,
    // from validation. Asserting only the empty issue list would therefore
    // pass on the broken source; the collection assertion is what makes this
    // a bug-catcher, and the empty issue list is what pins the decision to
    // collect these without existence-checking them.
    expect(collectEntityAttributeReferences(protocol)).toContainEqual(
      expect.objectContaining({
        path: ['stages', 0, 'prompts', 0, 'binSortOrder', 0, 'property'],
        variableId: 'a-stale-id',
        existence: 'unchecked',
      }),
    );
    expect(validateEntityAttributeReferences(protocol)).toEqual([]);
  });
});

describe('NameGeneratorRoster data-source columns', () => {
  it('collects card, sort and search columns as references', () => {
    const hits = collectEntityAttributeReferences(rosterStage(ROSTER_ONLY));
    const byPath = new Map(hits.map((hit) => [hit.path.join('.'), hit]));

    expect(
      byPath.get('stages.0.cardOptions.additionalProperties.0.variable')
        ?.variableId,
    ).toBe(AGE);
    expect(
      byPath.get('stages.0.sortOptions.sortableProperties.0.variable')
        ?.variableId,
    ).toBe(NAME);
    expect(
      byPath.get('stages.0.searchOptions.matchProperties.0')?.variableId,
    ).toBe(ROSTER_ONLY);
    expect(
      byPath.get('stages.0.sortOptions.sortOrder.0.property')?.variableId,
    ).toBe(NAME);
  });

  it('collects a column that names no codebook variable but does not report it', () => {
    // The shipped development protocol contains exactly this: a roster stage
    // whose `matchProperties` includes the literal column name
    // "variableNotInRegistry". Existence-checking these would make it fail to
    // open, in Architect and in every interview host.
    const protocol = rosterStage('variableNotInRegistry');

    // As above: the collection half is what fails on pre-#1392 source, where
    // the column was untagged and produced no hit for the empty issue list to
    // be about.
    expect(collectEntityAttributeReferences(protocol)).toContainEqual(
      expect.objectContaining({
        path: ['stages', 0, 'searchOptions', 'matchProperties', 0],
        variableId: 'variableNotInRegistry',
        existence: 'unchecked',
      }),
    );
    expect(validateEntityAttributeReferences(protocol)).toEqual([]);
  });
});

describe('checked references are unaffected', () => {
  it('reports the stale prompt variable and only that, on a prompt whose sort key is equally stale', () => {
    // One prompt, two dangling references: a CHECKED one (the prompt's own
    // `variable`) and an UNCHECKED one (its sort key). Exercising both on the
    // same value proves `existence: 'unchecked'` is scoped to the site rather
    // than switching existence checking off wholesale — which is the failure
    // mode that would make the two tests above pass for the wrong reason.
    const protocol = withStages([
      {
        id: 's1',
        type: 'OrdinalBin',
        label: 'Bin',
        subject,
        prompts: [
          {
            id: 'p1',
            text: 'prompt',
            variable: 'a-stale-id',
            color: 'ord-color-seq-1',
            binSortOrder: [{ property: 'another-stale-id', direction: 'asc' }],
          },
        ],
      },
    ]);

    // Both sites are collected: usage detection is complete regardless of
    // whether the id resolves. (Fails on pre-#1392 source, where the sort key
    // was untagged.)
    expect(
      collectEntityAttributeReferences(protocol).map((hit) => ({
        path: hit.path,
        variableId: hit.variableId,
        existence: hit.existence,
      })),
    ).toEqual([
      {
        path: ['stages', 0, 'prompts', 0, 'variable'],
        variableId: 'a-stale-id',
        existence: undefined,
      },
      {
        path: ['stages', 0, 'prompts', 0, 'binSortOrder', 0, 'property'],
        variableId: 'another-stale-id',
        existence: 'unchecked',
      },
    ]);

    // Only the checked one is reported.
    const issues = validateEntityAttributeReferences(protocol);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toEqual(['stages', 0, 'prompts', 0, 'variable']);
  });
});
