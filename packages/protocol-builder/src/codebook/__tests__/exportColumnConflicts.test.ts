import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import { readMessage } from '../../testing/i18n.ts';
import {
  type CodebookSubject,
  DuplicateVariableNameError,
  documentForNewEntity,
  documentWithCreatedVariable,
  documentWithEntityProperties,
  documentWithRebasedVariable,
  documentWithUpdatedVariable,
  ExportColumnConflictError,
  InvalidCodebookDraftError,
} from '../editing.ts';

/**
 * The codebook write is the last word on what two attributes may be called
 * together: every create, rename, option edit and change of type ends here, so
 * a control that offered a name the export cannot carry is still refused.
 */
const NODE: CodebookSubject = { entity: 'node', type: 'person' };
const EGO: CodebookSubject = { entity: 'ego' };

const EMPTY_CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: {},
  assets: {},
  orderedStages: [],
  issues: [],
};

const categorical = (name: string, values: readonly string[]) => ({
  name,
  type: 'categorical',
  component: 'CheckboxGroup',
  options: values.map((value) => ({ label: value, value })),
});

const text = (name: string) => ({ name, type: 'text', component: 'Text' });

const layout = (name: string) => ({ name, type: 'layout' });

const sectionOf = (variables: Record<string, unknown>): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables,
});

/** What a write refused with, as the researcher would read it. */
const conflictOf = (write: () => unknown) => {
  try {
    write();
  } catch (error: unknown) {
    if (error instanceof ExportColumnConflictError) {
      return {
        path: error.issues[0]?.path,
        text: readMessage(error.refusal),
      };
    }
    throw error;
  }
  return undefined;
};

const create = (
  authoritativeDocument: SectionDoc,
  draft: Record<string, unknown>,
  subject: CodebookSubject = NODE,
) =>
  documentWithCreatedVariable({
    subject,
    authoritativeDocument,
    variableId: 'new-variable',
    protocolContext: EMPTY_CONTEXT,
    draft,
  });

const update = (
  authoritativeDocument: SectionDoc,
  variableId: string,
  draft: Record<string, unknown>,
  replaceProperties?: readonly string[],
) =>
  documentWithUpdatedVariable({
    subject: NODE,
    authoritativeDocument,
    variableId,
    draft,
    ...(replaceProperties === undefined ? {} : { replaceProperties }),
  });

const storedVariable = (document: SectionDoc, variableId: string): unknown => {
  const variables: unknown = document.variables;
  return typeof variables === 'object' && variables !== null
    ? Reflect.get(variables, variableId)
    : undefined;
};

describe('creating an attribute', () => {
  it('refuses a name that is where an option of another attribute is written', () => {
    const section = sectionOf({ foo: categorical('foo', ['bar', 'baz']) });
    expect(conflictOf(() => create(section, text('foo_bar')))).toEqual({
      path: ['name'],
      text: 'The export already has a column called “foo_bar” for option “bar” of the attribute “foo”. Choose a different name.',
    });
  });

  it('refuses a name that is where a layout attribute writes a position', () => {
    const section = sectionOf({ pos: layout('pos') });
    for (const name of ['pos_x', 'pos_Y', 'pos_screenSpaceX']) {
      expect(conflictOf(() => create(section, text(name)))?.path).toEqual([
        'name',
      ]);
    }
  });

  it('refuses an option written where another attribute already is', () => {
    const section = sectionOf({ foo_bar: text('foo_bar') });
    expect(
      conflictOf(() => create(section, categorical('foo', ['bar', 'qux']))),
    ).toEqual({
      path: ['options'],
      text: 'Option “bar” of “foo” would be exported to a column called “foo_bar”, but the attribute “foo_bar” already has a column called “foo_bar”. Change the option value or the attribute name.',
    });
  });

  it('refuses an option written where an option of another attribute is', () => {
    const section = sectionOf({ a: categorical('a', ['b_c', 'd']) });
    expect(
      conflictOf(() => create(section, categorical('a_b', ['c', 'e'])))?.path,
    ).toEqual(['options']);
  });

  it('refuses an option written where a layout attribute writes a position', () => {
    const section = sectionOf({ a_b: layout('a_b') });
    expect(
      conflictOf(() => create(section, categorical('a', ['b_x', 'c'])))?.path,
    ).toEqual(['options']);
  });

  it('refuses a layout attribute whose position is written where another attribute is', () => {
    expect(
      conflictOf(() =>
        create(sectionOf({ pos_x: text('pos_x') }), layout('pos')),
      )?.path,
    ).toEqual(['name']);
    expect(
      conflictOf(() =>
        create(sectionOf({ a: categorical('a', ['b_x', 'c']) }), layout('a_b')),
      )?.path,
    ).toEqual(['name']);
  });

  it('refuses a name the export writes itself, in any case', () => {
    expect(conflictOf(() => create(sectionOf({}), text('nodeID')))).toEqual({
      path: ['name'],
      text: 'The export already has a built-in column called “nodeID”, so an attribute cannot be named “nodeID”. Choose a different name.',
    });
    expect(
      conflictOf(() => create(sectionOf({}), text('NetworkCanvasUUID')))?.path,
    ).toEqual(['name']);
  });

  it('judges a built-in column against the kind of thing it belongs to', () => {
    // `COMMIT_HASH` is a column of the participant's own row only.
    const draft = categorical('COMMIT', ['HASH', 'other']);
    expect(
      conflictOf(() => create({ variables: {} }, draft, EGO))?.path,
    ).toEqual(['options']);
    expect(() => create(sectionOf({}), draft)).not.toThrow();
  });

  it('does not expand an ordinal attribute into a column per option', () => {
    const section = sectionOf({ foo_bar: text('foo_bar') });
    expect(() =>
      create(section, {
        name: 'foo',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [
          { label: 'Bar', value: 'bar' },
          { label: 'Baz', value: 'baz' },
        ],
      }),
    ).not.toThrow();
  });

  it('leaves two attributes of one name to the duplicate-name refusal', () => {
    const section = sectionOf({ foo_bar: text('foo_bar') });
    expect(() => create(section, text('FOO_BAR'))).toThrow(
      DuplicateVariableNameError,
    );
  });

  it('accepts an attribute whose columns are its own', () => {
    const section = sectionOf({ foo: categorical('foo', ['bar', 'baz']) });
    expect(() => create(section, text('foo_qux'))).not.toThrow();
  });
});

describe('changing an attribute that is already in the codebook', () => {
  it('refuses a rename onto a column of another attribute', () => {
    const section = sectionOf({
      a: text('first'),
      foo: categorical('foo', ['bar', 'baz']),
    });
    expect(
      conflictOf(() => update(section, 'a', { name: 'foo_baz' }))?.text,
    ).toMatch(/column called “foo_baz” for option “baz”/);
  });

  it('refuses renaming a categorical attribute so that an option lands on a column', () => {
    const section = sectionOf({
      foo: categorical('foo', ['bar', 'baz']),
      other: text('other_bar'),
    });
    expect(conflictOf(() => update(section, 'foo', { name: 'other' }))).toEqual(
      {
        path: ['options'],
        text: 'Option “bar” of “other” would be exported to a column called “other_bar”, but the attribute “other_bar” already has a column called “other_bar”. Change the option value or the attribute name.',
      },
    );
  });

  it('refuses renaming a layout attribute so that a position lands on a column', () => {
    const section = sectionOf({
      pos: layout('pos'),
      other: text('other_y'),
    });
    expect(
      conflictOf(() => update(section, 'pos', { name: 'other' }))?.path,
    ).toEqual(['name']);
  });

  it('refuses an option added where another attribute already is', () => {
    const section = sectionOf({
      foo: categorical('foo', ['bar', 'baz']),
      other: text('foo_qux'),
    });
    expect(
      conflictOf(() =>
        update(
          section,
          'foo',
          {
            options: [
              { label: 'Bar', value: 'bar' },
              { label: 'Qux', value: 'qux' },
            ],
          },
          ['options'],
        ),
      ),
    ).toEqual({
      path: ['options'],
      text: 'Option “qux” of “foo” would be exported to a column called “foo_qux”, but the attribute “foo_qux” already has a column called “foo_qux”. Change the option value or the attribute name.',
    });
  });

  it('refuses an option that is renamed onto another attribute’s column', () => {
    const section = sectionOf({
      foo: categorical('foo', ['bar', 'baz']),
      other: text('foo_qux'),
    });
    expect(
      conflictOf(() =>
        update(
          section,
          'foo',
          {
            options: [
              { label: 'Bar', value: 'bar' },
              { label: 'Baz', value: 'qux' },
            ],
          },
          ['options'],
        ),
      )?.path,
    ).toEqual(['options']);
  });

  it('refuses a change of type that makes a name expand into taken columns', () => {
    const section = sectionOf({
      foo: text('foo'),
      other: text('foo_bar'),
    });
    expect(
      conflictOf(() =>
        update(
          section,
          'foo',
          {
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [
              { label: 'Bar', value: 'bar' },
              { label: 'Baz', value: 'baz' },
            ],
          },
          ['type', 'component', 'options'],
        ),
      )?.path,
    ).toEqual(['options']);
    expect(
      conflictOf(() =>
        update(
          sectionOf({ pos: text('pos'), other: text('pos_x') }),
          'pos',
          { type: 'layout' },
          ['type', 'component'],
        ),
      )?.path,
    ).toEqual(['name']);
  });

  it('accepts a change of type that makes a name expand into free columns', () => {
    const section = sectionOf({ foo: text('foo'), other: text('foo_baz') });
    expect(() =>
      update(
        section,
        'foo',
        {
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Bar', value: 'bar' },
            { label: 'Qux', value: 'qux' },
          ],
        },
        ['type', 'component', 'options'],
      ),
    ).not.toThrow();
  });

  it('does not count the attribute against itself', () => {
    const section = sectionOf({ foo: categorical('foo', ['bar', 'baz']) });
    expect(() => update(section, 'foo', { name: 'Foo' })).not.toThrow();
    expect(() =>
      update(
        section,
        'foo',
        {
          options: [
            { label: 'Bar', value: 'bar' },
            { label: 'Z', value: 'z' },
          ],
        },
        ['options'],
      ),
    ).not.toThrow();
  });

  describe('where the codebook already holds a clash', () => {
    // Written when names were narrower, or by a collaborator's older Studio.
    // Refusing every later save of the attributes involved would stop the
    // researcher changing anything but the thing they are asked to fix.
    const section = sectionOf({
      foo: categorical('foo', ['bar', 'baz']),
      clash: text('foo_bar'),
    });

    it('still saves an unrelated change to either attribute', () => {
      expect(() => update(section, 'clash', { encrypted: true })).not.toThrow();
      expect(() =>
        update(
          section,
          'foo',
          {
            options: [
              { label: 'Bar', value: 'bar' },
              { label: 'Baz', value: 'baz' },
              { label: 'Qux', value: 'qux' },
            ],
          },
          ['options'],
        ),
      ).not.toThrow();
    });

    it('still saves moving one of them off the clash', () => {
      expect(() =>
        update(section, 'clash', { name: 'foo_other' }),
      ).not.toThrow();
    });

    it('still refuses a second clash', () => {
      expect(
        conflictOf(() => update(section, 'clash', { name: 'foo_baz' }))?.path,
      ).toEqual(['name']);
    });
  });
});

describe('saving a nested editor’s finished document', () => {
  it('refuses a clash a collaborator’s attribute introduced while the editor was open', () => {
    // The editor's copy was built before `foo_bar` existed in the codebook.
    const hostsCopy = sectionOf({ foo_bar: text('foo_bar') });
    expect(
      conflictOf(() =>
        documentWithRebasedVariable({
          subject: NODE,
          authoritativeDocument: hostsCopy,
          submittedDocument: sectionOf({
            foo: categorical('foo', ['bar', 'qux']),
          }),
          variableId: 'foo',
        }),
      )?.path,
    ).toEqual(['options']);
  });
});

describe('the names the write stores', () => {
  it('stores an attribute name trimmed', () => {
    const written = create(sectionOf({}), text('  first_name  '));
    expect(storedVariable(written, 'new-variable')).toMatchObject({
      name: 'first_name',
    });
  });

  it('compares a trimmed name with the others when it checks for a duplicate', () => {
    const section = sectionOf({ foo: text('foo') });
    expect(() => create(section, text('  FOO  '))).toThrow(
      DuplicateVariableNameError,
    );
  });

  it.each(['友人', 'amigo cercano', 'Collègue', 'a.b [1]'])(
    'accepts the option value %j',
    (value) => {
      const written = update(
        sectionOf({ foo: categorical('foo', ['bar', 'baz']) }),
        'foo',
        {
          options: [
            { label: 'First', value },
            { label: 'Second', value: 'baz' },
          ],
        },
        ['options'],
      );
      expect(storedVariable(written, 'foo')).toMatchObject({
        options: [{ value }, { value: 'baz' }],
      });
    },
  );

  it('stores an option value trimmed and in canonical form', () => {
    const written = update(
      sectionOf({ foo: categorical('foo', ['bar', 'baz']) }),
      'foo',
      {
        options: [
          { label: 'First', value: `  ${'Collègue'.normalize('NFD')}  ` },
          { label: 'Second', value: 'baz' },
        ],
      },
      ['options'],
    );
    expect(storedVariable(written, 'foo')).toMatchObject({
      options: [{ value: 'Collègue' }, { value: 'baz' }],
    });
  });

  it.each([
    ['a tab', 'yes\tplease'],
    ['a line break', 'yes\nplease'],
    ['a nul', `yes${String.fromCharCode(0)}`],
  ])('refuses an option value holding %s', (_, value) => {
    expect(() =>
      update(
        sectionOf({ foo: categorical('foo', ['bar', 'baz']) }),
        'foo',
        {
          options: [
            { label: 'First', value },
            { label: 'Second', value: 'baz' },
          ],
        },
        ['options'],
      ),
    ).toThrow(InvalidCodebookDraftError);
  });

  it('says a control character in an option value in the researcher’s words', () => {
    try {
      update(
        sectionOf({ foo: categorical('foo', ['bar', 'baz']) }),
        'foo',
        {
          options: [
            { label: 'First', value: 'yes\tplease' },
            { label: 'Second', value: 'baz' },
          ],
        },
        ['options'],
      );
    } catch (error: unknown) {
      if (!(error instanceof InvalidCodebookDraftError)) throw error;
      expect(readMessage(error.issues[0]?.message ?? '')).toBe(
        'An option value cannot contain line breaks, tabs or other control characters.',
      );
      return;
    }
    expect.unreachable('the write accepted a tab in an option value');
  });
});

describe('the name of an entity type', () => {
  const draft = {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
  };

  it.each(['友人', 'amigo cercano', 'Collègue', 'Works With'])(
    'stores the name %j as typed',
    (name) => {
      expect(
        documentForNewEntity({ subject: NODE, draft: { ...draft, name } }).name,
      ).toBe(name);
    },
  );

  it('stores a name trimmed and in canonical form', () => {
    expect(
      documentForNewEntity({
        subject: NODE,
        draft: { ...draft, name: `  ${'Collègue'.normalize('NFD')} ` },
      }).name,
    ).toBe('Collègue');
    expect(
      documentWithEntityProperties({
        subject: NODE,
        authoritativeDocument: sectionOf({}),
        draft: { name: '  amigo cercano  ' },
      }).name,
    ).toBe('amigo cercano');
  });
});
