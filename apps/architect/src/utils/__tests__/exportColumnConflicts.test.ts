import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import type { ExportColumnVariable } from '@codaco/shared-consts';

import {
  findExportColumnConflictMessage,
  toExportColumnCandidate,
} from '../exportColumnConflicts';

const intl = createAppIntl({ locale: 'en' });

const text = (name: string): ExportColumnVariable => ({ name, type: 'text' });
const layout = (name: string): ExportColumnVariable => ({
  name,
  type: 'layout',
});
const categorical = (
  name: string,
  ...values: (string | number | boolean)[]
): ExportColumnVariable => ({
  name,
  type: 'categorical',
  options: values.map((value) => ({ value })),
});

const messageFor = (
  candidate: ExportColumnVariable | undefined,
  siblings: ExportColumnVariable[],
  origins?: Parameters<typeof findExportColumnConflictMessage>[0]['origins'],
  entity: 'node' | 'edge' | 'ego' = 'node',
) =>
  findExportColumnConflictMessage({
    entity,
    candidate,
    siblings,
    origins,
    intl,
  });

describe('export column conflicts, reported by the attribute being named', () => {
  it('explains a name that is already the column of a categorical option', () => {
    expect(messageFor(text('foo_bar'), [categorical('foo', 'bar')])).toBe(
      'Exported data already includes the column “foo_bar” for the option “bar” of the attribute “foo”, so an attribute can’t use this name.',
    );
  });

  it('explains a name that is already a layout attribute’s coordinate column', () => {
    expect(messageFor(text('pos_x'), [layout('pos')])).toBe(
      'Exported data already includes the column “pos_x” for the position of the layout attribute “pos”, so an attribute can’t use this name.',
    );
  });

  it('explains a name that is a built-in column, however it is capitalised', () => {
    expect(messageFor(text('networkcanvasuuid'), [])).toBe(
      'Exported data already includes a built-in column named “networkCanvasUUID”, so an attribute can’t use this name.',
    );
  });

  it('knows each entity’s own built-in columns', () => {
    expect(messageFor(text('from'), [], undefined, 'node')).toBeUndefined();
    expect(messageFor(text('from'), [], undefined, 'edge')).toMatch(
      /built-in column named “from”/,
    );
    expect(messageFor(text('caseId'), [], undefined, 'ego')).toMatch(
      /built-in column named “caseId”/,
    );
  });

  it('explains the coordinate column of a layout attribute that is already another attribute’s name', () => {
    expect(messageFor(layout('pos'), [text('pos_x')])).toBe(
      'A layout attribute is exported as one column for each coordinate, and the column “pos_x” is already used by the attribute “pos_x”. Choose a different name.',
    );
  });

  it('explains the coordinate column of a layout attribute that is already a categorical option’s column', () => {
    expect(messageFor(layout('a_b'), [categorical('a', 'b_x')])).toBe(
      'A layout attribute is exported as one column for each coordinate, and the column “a_b_x” is already used by the option “b_x” of the attribute “a”. Choose a different name.',
    );
  });

  it('names columns in any script', () => {
    expect(messageFor(text('友人_同僚'), [categorical('友人', '同僚')])).toBe(
      'Exported data already includes the column “友人_同僚” for the option “同僚” of the attribute “友人”, so an attribute can’t use this name.',
    );
  });

  it('compares columns case-insensitively and under canonical equivalence', () => {
    expect(
      messageFor(text('Collègue_Proche'), [
        categorical('colle\u0300gue', 'proche'),
      ]),
    ).toMatch(/for the option “proche” of the attribute “colle\u0300gue”/);
  });
});

describe('export column conflicts, reported by the options being added', () => {
  it('explains an option whose column is already another attribute’s name', () => {
    expect(messageFor(categorical('foo', 'bar'), [text('foo_bar')])).toBe(
      'The option “bar” would be exported to the column “foo_bar”, which the attribute “foo_bar” already uses. Change the option’s value or the attribute’s name.',
    );
  });

  it('explains an option whose column is already another categorical option’s column', () => {
    expect(
      messageFor(categorical('foo', 'bar_baz'), [
        categorical('foo_bar', 'baz'),
      ]),
    ).toBe(
      'The option “bar_baz” would be exported to the column “foo_bar_baz”, which the option “baz” of the attribute “foo_bar” already uses. Change the option’s value or the attribute’s name.',
    );
  });

  it('explains an option whose column is already a layout attribute’s coordinate column', () => {
    expect(messageFor(categorical('a', 'b_x'), [layout('a_b')])).toBe(
      'The option “b_x” would be exported to the column “a_b_x”, which the layout attribute “a_b” already uses for its position. Change the option’s value or the attribute’s name.',
    );
  });

  it('compares a number option as the text it is exported as', () => {
    expect(messageFor(categorical('foo', 1), [text('foo_1')])).toMatch(
      /The option “1” would be exported to the column “foo_1”/,
    );
  });

  it('reads options as they will be saved, so padding does not hide a clash', () => {
    const candidate = toExportColumnCandidate({
      name: 'foo',
      type: 'categorical',
      options: [{ label: 'Bar', value: ' bar ' }],
    });

    expect(messageFor(candidate, [text('foo_bar')])).toMatch(
      /The option “bar” would be exported/,
    );
  });
});

describe('export column conflicts, where there is none', () => {
  it('lets the same name through: that is the duplicate-name rule’s message', () => {
    expect(messageFor(text('foo'), [text('foo')])).toBeUndefined();
    expect(messageFor(text('FOO'), [text('foo')])).toBeUndefined();
  });

  it('does not expand an ordinal attribute into columns', () => {
    const ordinal: ExportColumnVariable = {
      name: 'foo',
      type: 'ordinal',
      options: [{ value: 'bar' }],
    };

    expect(messageFor(ordinal, [text('foo_bar')])).toBeUndefined();
    expect(messageFor(text('foo_bar'), [ordinal])).toBeUndefined();
  });

  it('lets a name through that merely looks alike', () => {
    expect(messageFor(text('foo bar'), [categorical('foo', 'bar')])).toBe(
      undefined,
    );
    expect(messageFor(text('foo-bar'), [categorical('foo', 'bar')])).toBe(
      undefined,
    );
  });
});

describe('export column conflicts, split between the name and the options fields', () => {
  const candidate = categorical('foo', 'bar');
  const siblings = [text('foo_bar')];

  it('leaves an option’s clash to the options field', () => {
    expect(messageFor(candidate, siblings, ['name', 'layout'])).toBeUndefined();
    expect(messageFor(candidate, siblings, ['option'])).toMatch(
      /The option “bar”/,
    );
  });

  it('leaves a coordinate’s clash to the name field', () => {
    expect(messageFor(layout('pos'), [text('pos_x')], ['option'])).toBe(
      undefined,
    );
    expect(
      messageFor(layout('pos'), [text('pos_x')], ['name', 'layout']),
    ).toMatch(/A layout attribute is exported/);
  });
});

describe('toExportColumnCandidate()', () => {
  it('waits for a name and a type', () => {
    expect(
      toExportColumnCandidate({ name: '', type: 'text', options: undefined }),
    ).toBeUndefined();
    expect(
      toExportColumnCandidate({
        name: '   ',
        type: 'text',
        options: undefined,
      }),
    ).toBeUndefined();
    expect(
      toExportColumnCandidate({
        name: 'foo',
        type: undefined,
        options: undefined,
      }),
    ).toBeUndefined();
    expect(
      toExportColumnCandidate({ name: 'foo', type: '', options: undefined }),
    ).toBeUndefined();
  });

  it('reads the name as it will be saved', () => {
    expect(
      toExportColumnCandidate({
        name: '  Colle\u0300gue ',
        type: 'text',
        options: undefined,
      }),
    ).toEqual({ name: 'Collègue', type: 'text', options: [] });
  });

  it('skips unfinished option rows', () => {
    expect(
      toExportColumnCandidate({
        name: 'foo',
        type: 'categorical',
        options: [
          { label: 'A' },
          { label: 'B', value: '  ' },
          { label: 'C', value: 'c' },
          { label: 'D', value: 4 },
          { label: 'E', value: false },
          null,
        ],
      })?.options,
    ).toEqual([{ value: 'c' }, { value: 4 }, { value: false }]);
  });
});
