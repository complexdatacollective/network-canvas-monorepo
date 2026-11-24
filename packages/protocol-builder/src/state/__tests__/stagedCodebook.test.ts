import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  mergeEdit,
  NOTHING_STAGED,
  overlaySection,
  stageSectionChange,
} from '../stagedCodebook.ts';

const NAME = testVariableId('name');
const AGE = testVariableId('age');

const PERSON = sectionId({
  kind: 'codebookNode',
  typeId: testTypeId('person'),
});
const PLACE = sectionId({ kind: 'codebookNode', typeId: testTypeId('place') });

const person = (validation?: Record<string, unknown>) => ({
  name: 'Person',
  color: 'node-color-seq-1',
  variables: {
    [NAME]: {
      name: 'name',
      type: 'text',
      ...(validation === undefined ? {} : { validation }),
    },
    [AGE]: { name: 'age', type: 'number' },
  },
});

describe('mergeEdit', () => {
  it('lays the edit over the current section, key by key', () => {
    const base = person({ unique: true });
    const edited = person({ unique: true, required: true });
    // A collaborator renamed the type and gave another attribute a rule of
    // their own while the edit was held.
    const current = {
      ...person({ unique: true }),
      name: 'Respondent',
      variables: {
        ...person({ unique: true }).variables,
        [AGE]: { name: 'age', type: 'number', validation: { minValue: 0 } },
      },
    };

    expect(mergeEdit(base, edited, current)).toEqual({
      ...current,
      variables: {
        ...current.variables,
        [NAME]: person({ unique: true, required: true }).variables[NAME],
      },
    });
  });

  it('merges an attribute’s rules rule by rule', () => {
    const base = person({ unique: true });
    const edited = person({ required: true });
    // A collaborator set a maximum length on the same attribute meanwhile.
    const current = person({ unique: true, maxLength: 20 });

    expect(mergeEdit(base, edited, current)).toEqual(
      person({ required: true, maxLength: 20 }),
    );
  });

  it('removes only the rules the edit removed when it removed the last one', () => {
    // The researcher switched off the attribute's one rule, which writes it
    // without rules at all; a collaborator added a rule of their own meanwhile.
    const base = person({ required: true });
    const edited = person();
    const current = person({ required: true, maxLength: 20 });

    expect(mergeEdit(base, edited, current)).toEqual(person({ maxLength: 20 }));
  });

  it('leaves an attribute without rules when the edit removed all it had', () => {
    const base = person({ required: true });
    expect(mergeEdit(base, person(), person({ required: true }))).toEqual(
      person(),
    );
  });

  it('takes the mapping a shape is drawn from whole', () => {
    const shaped = (dynamic: Record<string, unknown>) => ({
      ...person(),
      shape: { default: 'circle', dynamic },
    });
    const base = shaped({ variable: AGE, type: 'discrete', map: [] });
    const edited = shaped({
      variable: testVariableId('sex'),
      type: 'discrete',
      map: ['a'],
    });
    const current = shaped({
      variable: AGE,
      type: 'breakpoints',
      map: ['b'],
    });

    expect(mergeEdit(base, edited, current)).toEqual(edited);
  });

  it('leaves an attribute deleted by a collaborator deleted, edited or not', () => {
    const base = person();
    const edited = person({ required: true });
    const { [NAME]: _name, ...withoutName } = person().variables;
    const current = { ...person(), variables: withoutName };

    expect(mergeEdit(base, edited, current)).toEqual(current);
  });

  it('keeps a collaborator’s removal of something the edit did not touch', () => {
    const base = person({ unique: true });
    const edited = { ...person({ unique: true }), color: 'node-color-seq-4' };
    const { [AGE]: _age, ...withoutAge } = person({ unique: true }).variables;
    const current = { ...person({ unique: true }), variables: withoutAge };

    expect(mergeEdit(base, edited, current)).toEqual({
      ...current,
      color: 'node-color-seq-4',
    });
  });

  it('takes the edit’s value where both sides changed a value', () => {
    expect(
      mergeEdit({ shape: 'circle' }, { shape: 'square' }, { shape: 'diamond' }),
    ).toEqual({ shape: 'square' });
  });

  it('treats a list as one value', () => {
    expect(
      mergeEdit(
        { options: [1, 2] },
        { options: [1, 2, 3] },
        { options: [1, 2, 4] },
      ),
    ).toEqual({ options: [1, 2, 3] });
  });

  it('is the current section when the edit changed nothing', () => {
    const current = person({ maxLength: 3 });
    expect(mergeEdit(person(), person(), current)).toBe(current);
  });
});

describe('overlaySection', () => {
  it('drops the edits to a section the protocol no longer holds', () => {
    expect(
      overlaySection(
        { base: person(), edited: person({ required: true }) },
        undefined,
      ),
    ).toBeUndefined();
  });

  it('shows a section the edit created', () => {
    const created = { name: 'Place', color: 'node-color-seq-2', variables: {} };
    expect(overlaySection({ base: null, edited: created }, undefined)).toBe(
      created,
    );
  });

  it('keeps what a collaborator put in a section the edit also created', () => {
    expect(
      overlaySection(
        { base: null, edited: { variables: { mine: { name: 'mine' } } } },
        { variables: { theirs: { name: 'theirs' } } },
      ),
    ).toEqual({
      variables: { mine: { name: 'mine' }, theirs: { name: 'theirs' } },
    });
  });
});

describe('stageSectionChange', () => {
  const withRequired = (document: Record<string, unknown>) => ({
    ...document,
    variables: {
      ...(document.variables as Record<string, unknown>),
      [NAME]: { name: 'name', type: 'text', validation: { required: true } },
    },
  });

  it('keeps a change against the section as the protocol holds it', () => {
    const current = person();
    const staged = stageSectionChange(
      NOTHING_STAGED,
      PERSON,
      current,
      withRequired,
    );

    expect(staged).toEqual({
      [PERSON]: { base: current, edited: withRequired(current) },
    });
  });

  it('lays a second change over the first', () => {
    const current = person();
    const first = stageSectionChange(
      NOTHING_STAGED,
      PERSON,
      current,
      withRequired,
    );
    if (first === 'gone') throw new Error('unreachable');
    const second = stageSectionChange(first, PERSON, current, (document) => ({
      ...document,
      color: 'node-color-seq-5',
    }));

    expect(second).toEqual({
      [PERSON]: {
        base: current,
        edited: { ...withRequired(current), color: 'node-color-seq-5' },
      },
    });
  });

  it('stops holding a section once it is back as the protocol holds it', () => {
    const current = person();
    const first = stageSectionChange(
      NOTHING_STAGED,
      PERSON,
      current,
      withRequired,
    );
    if (first === 'gone') throw new Error('unreachable');

    expect(stageSectionChange(first, PERSON, current, () => current)).toEqual(
      {},
    );
  });

  it('refuses a change to a section the protocol does not hold', () => {
    expect(
      stageSectionChange(NOTHING_STAGED, PLACE, undefined, withRequired),
    ).toBe('gone');
  });

  it('brings a section into being from what the caller starts it with', () => {
    expect(
      stageSectionChange(NOTHING_STAGED, PLACE, undefined, withRequired, {}),
    ).toEqual({ [PLACE]: { base: null, edited: withRequired({}) } });
  });

  it('leaves what it holds alone when the change is refused', () => {
    expect(() =>
      stageSectionChange(NOTHING_STAGED, PERSON, person(), () => {
        throw new Error('refused');
      }),
    ).toThrow('refused');
  });
});
