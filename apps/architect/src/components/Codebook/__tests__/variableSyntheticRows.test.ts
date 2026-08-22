import { describe, expect, it } from 'vitest';

import {
  buildVariableSyntheticRows,
  type CodebookVariableSynthetic,
} from '../variableSyntheticRows';
import { FIXTURE_DOCUMENT } from './fixtureProtocol';

/**
 * The synthetic half of the codebook's attribute table, derived from a real
 * protocol document by the real schema walk.
 *
 * Two things come out of that walk, and both are asserted here: the sentences
 * the table shows about what the interviews have already decided, and the rules
 * the shared sub-editor is handed so a control an interface made meaningless
 * renders disabled. The last describe removes the one stage that implies them
 * and requires every claim to change — a note or a rule that survived the
 * removal of its own source would be a hardcoded string wearing a derivation's
 * clothes.
 */

const PERSON = FIXTURE_DOCUMENT.codebook.node.person;
const FRIEND = FIXTURE_DOCUMENT.codebook.edge.friend;

const personRows = (document: unknown = FIXTURE_DOCUMENT) =>
  buildVariableSyntheticRows(
    document,
    { entity: 'node', type: 'person' },
    PERSON.variables,
  );

const rowFor = (
  rows: Map<string, CodebookVariableSynthetic>,
  variableId: string,
): CodebookVariableSynthetic => {
  const row = rows.get(variableId);
  if (!row) throw new Error(`No synthetic row for "${variableId}"`);
  return row;
};

describe('what the interviews have already decided', () => {
  const rows = personRows();

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
  });

  it('says nothing about a rule the attribute declared itself', () => {
    // The note is about what the INTERVIEW decided. A `required` an author
    // wrote is already visible in the attribute's own validation, and
    // reporting it here would attribute their own decision to a stage.
    const declaredRequired = {
      ...FIXTURE_DOCUMENT,
      codebook: {
        ...FIXTURE_DOCUMENT.codebook,
        node: {
          ...FIXTURE_DOCUMENT.codebook.node,
          person: {
            ...PERSON,
            variables: {
              ...PERSON.variables,
              personName: {
                ...PERSON.variables.personName,
                validation: { required: true },
              },
            },
          },
        },
      },
    };

    const changed = buildVariableSyntheticRows(
      declaredRequired,
      { entity: 'node', type: 'person' },
      declaredRequired.codebook.node.person.variables,
    );
    expect(rowFor(changed, 'personName').notes).toEqual([]);
  });

  it('covers every attribute of the subject, including ones with nothing to say', () => {
    // Keyed by every attribute the codebook holds rather than only the ones
    // with notes, so a row can look its own entry up without a fallback that
    // would quietly mask a missing derivation.
    expect([...personRows().keys()]).toEqual(Object.keys(PERSON.variables));
  });

  it('answers for an edge type as readily as a node type', () => {
    const edgeRows = buildVariableSyntheticRows(
      FIXTURE_DOCUMENT,
      { entity: 'edge', type: 'friend' },
      FRIEND.variables,
    );
    expect(rowFor(edgeRows, 'friendStrength').notes).toEqual([]);
  });

  it('answers for ego, which has no type at all', () => {
    const egoRows = buildVariableSyntheticRows(
      FIXTURE_DOCUMENT,
      { entity: 'ego' },
      FIXTURE_DOCUMENT.codebook.ego.variables,
    );
    expect(rowFor(egoRows, 'egoAge').notes).toEqual([]);
  });
});

describe('the rules handed to the sub-editor', () => {
  const rows = personRows();

  it('carries the implied rules themselves, not merely a sentence about them', () => {
    const contact = rowFor(rows, 'personContact');
    expect(contact.implied.rules.required).toBe(true);
    expect(contact.implied.rules.maxSelected).toBe(1);
    expect(contact.implied.binOnly).toBe(true);
  });

  it('names the stages a disabled control has to explain itself by', () => {
    const contact = rowFor(rows, 'personContact');
    expect(contact.implied.alwaysAnsweredBy).toEqual(['Contact types']);
    expect(contact.implied.selectionPinnedBy).toEqual(['Contact types']);
    expect(rowFor(rows, 'personName').implied.alwaysAnsweredBy).toEqual([
      'Quick add friends',
    ]);
  });

  it('imposes nothing on an attribute no interface writes', () => {
    const trust = rowFor(rows, 'personTrust');
    expect(trust.implied.rules).toEqual({});
    expect(trust.implied.binOnly).toBe(false);
    expect(trust.implied.alwaysAnsweredBy).toEqual([]);
  });
});

describe('without the stage that implied the rules', () => {
  // The same codebook, the same document keys, one stage fewer. Everything
  // below must change, or the notes and the rules were never derived from the
  // protocol at all.
  const withoutBin = {
    ...FIXTURE_DOCUMENT,
    stages: FIXTURE_DOCUMENT.stages.filter(
      (stage) => stage.id !== 'contact-types',
    ),
  };
  const changed = personRows(withoutBin);

  it('drops the notes the removed stage was the source of', () => {
    expect(rowFor(changed, 'personContact').notes).toEqual([]);
  });

  it('drops the rules the removed stage was imposing', () => {
    const contact = rowFor(changed, 'personContact');
    expect(contact.implied.rules).toEqual({});
    expect(contact.implied.binOnly).toBe(false);
    expect(contact.implied.selectionPinnedBy).toEqual([]);
  });

  it('leaves the attributes the removed stage never touched alone', () => {
    expect(rowFor(changed, 'personName').notes).toEqual(
      rowFor(personRows(), 'personName').notes,
    );
  });
});
