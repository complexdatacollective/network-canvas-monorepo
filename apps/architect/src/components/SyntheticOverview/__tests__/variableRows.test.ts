import { describe, expect, it } from 'vitest';

import { buildVariableRows, type SyntheticVariableRow } from '../variableRows';
import { FIXTURE_DOCUMENT, parseFixture } from './fixtureProtocol';

/**
 * The variable table's derivation, over the REAL schema parse of a real
 * protocol document.
 *
 * The resolved behaviours come from `resolveVariableSynthetic` asked with the
 * effective rules — the variable's own validation narrowed by whatever the
 * protocol's interfaces impose — so the same fixture with one stage removed
 * must produce different rows. The last describe does exactly that, because a
 * note or a selection table that survived the removal of the interface that
 * implied it would be a hardcoded string wearing a derivation's clothes.
 */

const rows = buildVariableRows(parseFixture(), FIXTURE_DOCUMENT);

const rowFor = (
  candidates: readonly SyntheticVariableRow[],
  variableId: string,
): SyntheticVariableRow => {
  const row = candidates.find((entry) => entry.variableId === variableId);
  if (!row) throw new Error(`No variable row for "${variableId}"`);
  return row;
};

describe('variable rows', () => {
  it('lists every attribute synthetic data can fill, and no other', () => {
    // `personLayout` is absent: generation places nodes deterministically, so
    // a layout attribute has no behaviour to describe and nothing to author.
    expect(rows.map((row) => row.variableId)).toEqual([
      'egoAge',
      'personName',
      'personAge',
      'personClose',
      'personContact',
      'personRecent',
      'personTrust',
      'friendStrength',
    ]);
  });

  it('names the type each attribute belongs to', () => {
    expect(rowFor(rows, 'egoAge').entityLabel).toBe('Ego');
    expect(rowFor(rows, 'personAge').entityLabel).toBe('Person');
    expect(rowFor(rows, 'friendStrength').entityLabel).toBe('Friend');
  });

  it('infers a text generator from the attribute name', () => {
    expect(rowFor(rows, 'personName').behaviour).toBe('Person names');
  });

  it('draws a number inside the window its own validation states', () => {
    expect(rowFor(rows, 'personAge').behaviour).toBe('uniform(min 18, max 90)');
  });

  it('splits an undeclared boolean evenly', () => {
    expect(rowFor(rows, 'personClose').behaviour).toBe('True 50% of the time');
  });

  it('weights an option list uniformly, by option label', () => {
    expect(rowFor(rows, 'friendStrength').behaviour).toBe('Weak ×1, Strong ×1');
  });

  it("states a datetime's session-relative window", () => {
    // Grouped like every other number this screen shows: the shared summary
    // formatters have one number format, and a datetime's day offsets are not
    // an exception to it.
    expect(rowFor(rows, 'personRecent').behaviour).toBe(
      'uniform(3,650 days before to 0 days after the interview date)',
    );
  });

  it('shows an authored distribution as the author wrote it', () => {
    const trust = rowFor(rows, 'personTrust');
    expect(trust.behaviour).toBe('normal(mean 0.5, sd 0.2)');
    expect(trust.authored).toBe(true);
  });

  it('reports missingness only where there is any', () => {
    expect(rowFor(rows, 'personTrust').missing).toBe('10%');
    expect(rowFor(rows, 'personAge').missing).toBe('Never');
  });

  it('reads the authored badge from the document, not from the parse', () => {
    // Every row below has a fully resolved behaviour; only the ones whose
    // document states a `synthetic` block are authored.
    expect(
      rows.filter((row) => row.authored).map((row) => row.variableId),
    ).toEqual(['egoAge', 'personTrust']);
    expect(rowFor(rows, 'egoAge').behaviour).toBe('constant(40)');
  });
});

describe('interface-implied rules', () => {
  it('names the rule and the stage that imposes it, as whole sentences', () => {
    expect(rowFor(rows, 'personName').notes).toEqual([
      'Always answered: “Quick add friends” cannot leave this attribute blank.',
    ]);
  });

  it('reports every rule a binning stage imposes on the attribute it bins', () => {
    expect(rowFor(rows, 'personContact').notes).toEqual([
      'Always answered: “Contact types” cannot leave this attribute blank.',
      'Single choice: “Contact types” assigns exactly one option.',
      'Validation is not applied: “Contact types” assigns this attribute by placement rather than through a form field.',
    ]);
  });

  it('leaves an attribute no interface constrains without notes', () => {
    expect(rowFor(rows, 'personAge').notes).toEqual([]);
    expect(rowFor(rows, 'friendStrength').notes).toEqual([]);
  });

  it('narrows the selection count to what the binning stage allows', () => {
    // A bin places an alter in exactly one bin, so the only reachable size is
    // one — even though the attribute's own validation allows two.
    expect(rowFor(rows, 'personContact').selection).toBe('1 (100%)');
  });

  it('drops the declared validation of an attribute only a bin writes', () => {
    // A bin-only attribute is never rendered as a form field, so the interview
    // enforces none of its validation and generation reads it the same way.
    // Applying the declared `minSelected` here showed "2 (100%)" beside this
    // row's own "assigns exactly one option" note, while every generated
    // session carried a single value.
    const binOnlyWithMinSelected = {
      ...FIXTURE_DOCUMENT,
      codebook: {
        ...FIXTURE_DOCUMENT.codebook,
        node: {
          ...FIXTURE_DOCUMENT.codebook.node,
          person: {
            ...FIXTURE_DOCUMENT.codebook.node.person,
            variables: {
              ...FIXTURE_DOCUMENT.codebook.node.person.variables,
              personContact: {
                ...FIXTURE_DOCUMENT.codebook.node.person.variables
                  .personContact,
                validation: { minSelected: 2 },
              },
            },
          },
        },
      },
    };

    const changed = buildVariableRows(
      parseFixture(binOnlyWithMinSelected),
      binOnlyWithMinSelected,
    );

    expect(rowFor(changed, 'personContact').selection).toBe('1 (100%)');
    expect(rowFor(changed, 'personContact').notes).toContain(
      'Validation is not applied: “Contact types” assigns this attribute by placement rather than through a form field.',
    );
  });
});

describe('without the stage that implied the rules', () => {
  // The same codebook, the same document keys, one stage fewer. Everything
  // below must change, or the notes and the selection table were never
  // derived from the protocol at all.
  const withoutBin = {
    ...FIXTURE_DOCUMENT,
    stages: FIXTURE_DOCUMENT.stages.filter(
      (stage) => stage.id !== 'contact-types',
    ),
  };
  const changed = buildVariableRows(parseFixture(withoutBin), withoutBin);

  it('drops the notes the removed stage was the source of', () => {
    expect(rowFor(changed, 'personContact').notes).toEqual([]);
  });

  it('widens the selection count the removed stage was narrowing', () => {
    expect(rowFor(changed, 'personContact').selection).toBe('1 (50%), 2 (50%)');
  });

  it('leaves the attributes the removed stage never touched alone', () => {
    expect(rowFor(changed, 'personName').notes).toEqual(
      rowFor(rows, 'personName').notes,
    );
  });
});
