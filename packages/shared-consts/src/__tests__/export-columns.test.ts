import { describe, expect, it } from 'vitest';

import {
  categoricalOptionColumn,
  type ExportColumnEntity,
  type ExportColumnVariable,
  findExportColumnConflicts,
  layoutColumn,
  variableExportColumnEntries,
} from '../export-columns.ts';

const char = (codePoint: number) => String.fromCodePoint(codePoint);

const text = (name: string): ExportColumnVariable => ({ name, type: 'text' });

const categorical = (
  name: string,
  ...values: (string | number)[]
): ExportColumnVariable => ({
  name,
  type: 'categorical',
  options: values.map((value) => ({ value })),
});

const ordinal = (
  name: string,
  ...values: (string | number)[]
): ExportColumnVariable => ({
  name,
  type: 'ordinal',
  options: values.map((value) => ({ value })),
});

const layout = (name: string): ExportColumnVariable => ({
  name,
  type: 'layout',
});

const conflicts = (
  candidate: ExportColumnVariable,
  siblings: readonly ExportColumnVariable[],
  entity: ExportColumnEntity = 'node',
) => findExportColumnConflicts({ entity, candidate, siblings });

const clashingColumns = (
  candidate: ExportColumnVariable,
  siblings: readonly ExportColumnVariable[],
) =>
  conflicts(candidate, siblings)
    .map(({ column }) => column.toLowerCase())
    .toSorted();

describe('categoricalOptionColumn', () => {
  it('joins the variable and the option value with an underscore', () => {
    expect(categoricalOptionColumn('closeness', 'very')).toBe('closeness_very');
    expect(categoricalOptionColumn('closeness', 1)).toBe('closeness_1');
    expect(categoricalOptionColumn('amigo cercano', '友人')).toBe(
      'amigo cercano_友人',
    );
  });
});

describe('layoutColumn', () => {
  it('spells the normalized coordinates in lower case for CSV and upper case for GraphML', () => {
    expect(layoutColumn('csv', 'pos', 'x')).toBe('pos_x');
    expect(layoutColumn('csv', 'pos', 'y')).toBe('pos_y');
    expect(layoutColumn('graphml', 'pos', 'x')).toBe('pos_X');
    expect(layoutColumn('graphml', 'pos', 'y')).toBe('pos_Y');
  });

  it('spells the screen-space coordinates the same in both formats', () => {
    for (const format of ['csv', 'graphml'] as const) {
      expect(layoutColumn(format, 'pos', 'screenSpaceX')).toBe(
        'pos_screenSpaceX',
      );
      expect(layoutColumn(format, 'pos', 'screenSpaceY')).toBe(
        'pos_screenSpaceY',
      );
    }
  });
});

describe('variableExportColumnEntries', () => {
  const csv = { format: 'csv', useScreenLayoutCoordinates: false } as const;
  const variableExportColumns = (
    variable: ExportColumnVariable,
    options: Parameters<typeof variableExportColumnEntries>[1],
  ) =>
    variableExportColumnEntries(variable, options).map(({ column }) => column);

  it('says what in the variable produces each column', () => {
    expect(
      variableExportColumnEntries(categorical('foo', 'bar', 2), csv),
    ).toEqual([
      { column: 'foo_bar', origin: { kind: 'option', value: 'bar' } },
      { column: 'foo_2', origin: { kind: 'option', value: 2 } },
    ]);
    expect(variableExportColumnEntries(layout('pos'), csv)).toEqual([
      { column: 'pos_x', origin: { kind: 'layout', axis: 'x' } },
      { column: 'pos_y', origin: { kind: 'layout', axis: 'y' } },
    ]);
    expect(variableExportColumnEntries(text('amigo'), csv)).toEqual([
      { column: 'amigo', origin: { kind: 'name' } },
    ]);
  });

  it('writes one column per categorical option', () => {
    expect(variableExportColumns(categorical('foo', 'bar', 2), csv)).toEqual([
      'foo_bar',
      'foo_2',
    ]);
  });

  it('writes nothing for a categorical variable without options', () => {
    expect(variableExportColumns(categorical('foo'), csv)).toEqual([]);
  });

  it('writes the screen-space columns only when they are asked for', () => {
    expect(variableExportColumns(layout('pos'), csv)).toEqual([
      'pos_x',
      'pos_y',
    ]);
    expect(
      variableExportColumns(layout('pos'), {
        format: 'csv',
        useScreenLayoutCoordinates: true,
      }),
    ).toEqual(['pos_x', 'pos_y', 'pos_screenSpaceX', 'pos_screenSpaceY']);
    expect(
      variableExportColumns(layout('pos'), {
        format: 'graphml',
        useScreenLayoutCoordinates: true,
      }),
    ).toEqual(['pos_X', 'pos_Y', 'pos_screenSpaceX', 'pos_screenSpaceY']);
  });

  // Ordinal variables have options too, but are written as the one value
  // chosen, in one column named after the variable.
  it('does not expand an ordinal variable', () => {
    expect(variableExportColumns(ordinal('rank', 1, 2, 3), csv)).toEqual([
      'rank',
    ]);
  });

  it('writes every other type to one column named after the variable', () => {
    expect(variableExportColumns(text('amigo cercano'), csv)).toEqual([
      'amigo cercano',
    ]);
    expect(
      variableExportColumns(
        {
          name: 'isFriend',
          type: 'boolean',
          options: [{ value: true }, { value: false }],
        },
        csv,
      ),
    ).toEqual(['isFriend']);
  });
});

describe('findExportColumnConflicts', () => {
  it('refuses a name that a categorical sibling writes as an option column', () => {
    const foo = categorical('foo', 'bar');

    expect(conflicts(text('foo_bar'), [foo])).toEqual([
      {
        kind: 'sibling',
        column: 'foo_bar',
        origin: { kind: 'name' },
        sibling: foo,
        siblingColumn: 'foo_bar',
        siblingOrigin: { kind: 'option', value: 'bar' },
        formats: ['csv', 'graphml'],
      },
    ]);
  });

  it('refuses an option whose column a sibling is already named', () => {
    const fooBar = text('foo_bar');

    expect(conflicts(categorical('foo', 'baz'), [fooBar])).toEqual([]);
    expect(conflicts(categorical('foo', 'baz', 'bar'), [fooBar])).toEqual([
      {
        kind: 'sibling',
        column: 'foo_bar',
        origin: { kind: 'option', value: 'bar' },
        sibling: fooBar,
        siblingColumn: 'foo_bar',
        siblingOrigin: { kind: 'name' },
        formats: ['csv', 'graphml'],
      },
    ]);
  });

  it('refuses a rename that moves a categorical variable onto a sibling', () => {
    const siblings = [text('x_bar')];

    expect(conflicts(categorical('foo', 'bar'), siblings)).toEqual([]);
    expect(clashingColumns(categorical('x', 'bar'), siblings)).toEqual([
      'x_bar',
    ]);
  });

  it('refuses two categorical variables whose option columns meet', () => {
    const a = categorical('a', 'b_c');

    expect(conflicts(categorical('a_b', 'c'), [a])).toEqual([
      {
        kind: 'sibling',
        column: 'a_b_c',
        origin: { kind: 'option', value: 'c' },
        sibling: a,
        siblingColumn: 'a_b_c',
        siblingOrigin: { kind: 'option', value: 'b_c' },
        formats: ['csv', 'graphml'],
      },
    ]);
  });

  it('refuses a name that a layout sibling writes as a coordinate column', () => {
    const pos = layout('pos');

    expect(conflicts(text('pos_x'), [pos])).toEqual([
      {
        kind: 'sibling',
        column: 'pos_x',
        origin: { kind: 'name' },
        sibling: pos,
        siblingColumn: 'pos_x',
        siblingOrigin: { kind: 'layout', axis: 'x' },
        formats: ['csv', 'graphml'],
      },
    ]);
    // GraphML's spelling.
    expect(clashingColumns(text('pos_Y'), [pos])).toEqual(['pos_y']);
    // Written only when screen-space coordinates are exported, which nobody
    // has decided while the variable is being named.
    expect(clashingColumns(text('pos_screenSpaceX'), [pos])).toEqual([
      'pos_screenspacex',
    ]);
  });

  it('refuses a layout variable whose coordinate columns a sibling is named', () => {
    const posY = text('pos_y');

    expect(conflicts(layout('pos'), [posY])).toEqual([
      {
        kind: 'sibling',
        column: 'pos_y',
        origin: { kind: 'layout', axis: 'y' },
        sibling: posY,
        siblingColumn: 'pos_y',
        siblingOrigin: { kind: 'name' },
        formats: ['csv', 'graphml'],
      },
    ]);
  });

  it('reports every clash a variable has', () => {
    expect(
      clashingColumns(categorical('a', 'b', 'c', 'd'), [
        text('a_b'),
        text('a_c'),
      ]),
    ).toEqual(['a_b', 'a_c']);
  });

  // Case-folded and canonically composed, like the editors' duplicate-name
  // check: `Café_Bar` and a decomposed, lower-case `café_bar` are one column.
  it('compares columns as the duplicate-name check compares names', () => {
    const decomposed = `cafe${char(0x301)}_bar`;
    const cafe = categorical(`Caf${char(0xe9)}`, 'Bar');

    expect(conflicts(text(decomposed), [cafe])).toEqual([
      {
        kind: 'sibling',
        column: decomposed,
        origin: { kind: 'name' },
        sibling: cafe,
        siblingColumn: `Caf${char(0xe9)}_Bar`,
        siblingOrigin: { kind: 'option', value: 'Bar' },
        formats: ['csv', 'graphml'],
      },
    ]);
  });

  it('accepts names whose columns only look alike', () => {
    const foo = categorical('foo', 'bar');

    expect(conflicts(text('foo_baz'), [foo])).toEqual([]);
    expect(conflicts(text('foobar'), [foo])).toEqual([]);
    expect(conflicts(text('foo_bar_'), [foo])).toEqual([]);
    expect(conflicts(text('pos_z'), [layout('pos')])).toEqual([]);
    expect(conflicts(text('foo-bar'), [foo])).toEqual([]);
  });

  describe('compares columns as each format writes them', () => {
    // GraphML writes `attr.name` as an NMTOKEN, with `_` for each space or
    // punctuation mark it cannot hold.
    it('refuses two names GraphML writes as the same attribute name', () => {
      const aQuestionB = text('a?b');

      expect(conflicts(text('a b'), [aQuestionB])).toEqual([
        {
          kind: 'sibling',
          column: 'a b',
          origin: { kind: 'name' },
          sibling: aQuestionB,
          siblingColumn: 'a?b',
          siblingOrigin: { kind: 'name' },
          formats: ['graphml'],
          writtenColumn: 'a_b',
        },
      ]);
    });

    it('refuses a name GraphML writes as a sibling’s own name', () => {
      const closeFriend = text('close_friend');

      expect(conflicts(text('close friend'), [closeFriend])).toEqual([
        {
          kind: 'sibling',
          column: 'close friend',
          origin: { kind: 'name' },
          sibling: closeFriend,
          siblingColumn: 'close_friend',
          siblingOrigin: { kind: 'name' },
          formats: ['graphml'],
          writtenColumn: 'close_friend',
        },
      ]);
    });

    it('refuses two options of one variable GraphML writes as one attribute name', () => {
      expect(conflicts(categorical('q', 'a b', 'a?b', 'c'), [])).toEqual([
        {
          kind: 'own',
          column: 'q_a b',
          origin: { kind: 'option', value: 'a b' },
          otherColumn: 'q_a?b',
          otherOrigin: { kind: 'option', value: 'a?b' },
          formats: ['graphml'],
          writtenColumn: 'q_a_b',
        },
        {
          kind: 'own',
          column: 'q_a?b',
          origin: { kind: 'option', value: 'a?b' },
          otherColumn: 'q_a b',
          otherOrigin: { kind: 'option', value: 'a b' },
          formats: ['graphml'],
          writtenColumn: 'q_a_b',
        },
      ]);
    });

    // Two options with the same value are refused as a duplicate value, with
    // that message; a variable whose columns all differ has nothing to refuse.
    it('leaves options with the same value to the duplicate-value check', () => {
      expect(conflicts(categorical('q', 'yes', 'YES'), [])).toEqual([]);
      expect(conflicts(categorical('q', 1, '1'), [])).toEqual([]);
      expect(conflicts(categorical('q', 'a b', 'a_c'), [])).toEqual([]);
      expect(conflicts(layout('pos'), [])).toEqual([]);
    });

    it('refuses an option column GraphML writes as a sibling’s name', () => {
      const closeFriend = text('close friend');

      expect(conflicts(categorical('close', 'friend'), [closeFriend])).toEqual([
        {
          kind: 'sibling',
          column: 'close_friend',
          origin: { kind: 'option', value: 'friend' },
          sibling: closeFriend,
          siblingColumn: 'close friend',
          siblingOrigin: { kind: 'name' },
          formats: ['graphml'],
          writtenColumn: 'close_friend',
        },
      ]);
    });

    it('refuses two layout variables whose GraphML position columns meet', () => {
      expect(clashingColumns(layout('a b'), [layout('a_b')])).toEqual([
        'a b_screenspacex',
        'a b_screenspacey',
        'a b_x',
        'a b_y',
      ]);
    });

    // A CSV header that begins like a formula is written with a `'` in front,
    // so `=total` is written as the header a variable called `'=total` has.
    it('refuses two names CSV writes as the same header', () => {
      const guarded = text("'=total");

      expect(conflicts(text('=total'), [guarded])).toEqual([
        {
          kind: 'sibling',
          column: '=total',
          origin: { kind: 'name' },
          sibling: guarded,
          siblingColumn: "'=total",
          siblingOrigin: { kind: 'name' },
          formats: ['csv'],
          writtenColumn: "'=total",
        },
      ]);
    });

    it.each([
      [text('a b'), text('a?b')],
      [text('close friend'), text('close_friend')],
      [text('=total'), text("'=total")],
      [categorical('close', 'friend'), text('close friend')],
      [layout('a b'), layout('a_b')],
    ])('refuses %j beside %j and the other way round', (left, right) => {
      const written = (
        candidate: ExportColumnVariable,
        sibling: ExportColumnVariable,
      ) =>
        conflicts(candidate, [sibling])
          .map((conflict) =>
            conflict.kind === 'sibling' ? conflict.writtenColumn : undefined,
          )
          .toSorted((a, b) => (a ?? '').localeCompare(b ?? ''));

      expect(written(left, right)).not.toEqual([]);
      expect(written(left, right)).not.toContain(undefined);
      expect(written(left, right)).toEqual(written(right, left));
    });

    it('reports a clash both formats make once, naming both', () => {
      const ex = categorical('=x', 'y');

      expect(conflicts(text('=x_y'), [ex])).toEqual([
        {
          kind: 'sibling',
          column: '=x_y',
          origin: { kind: 'name' },
          sibling: ex,
          siblingColumn: '=x_y',
          siblingOrigin: { kind: 'option', value: 'y' },
          formats: ['csv', 'graphml'],
        },
      ]);
    });
  });

  // A duplicate name is the editors' duplicate-name check to refuse, with its
  // own message; reporting its columns here as well would refuse it twice.
  it('leaves a sibling with the same name to the duplicate-name check', () => {
    expect(conflicts(categorical('foo', 'x'), [layout('FOO')])).toEqual([]);
  });

  it('hands back the sibling it was given', () => {
    const siblings = [{ id: 'v1', ...categorical('foo', 'bar') }];
    const [conflict] = findExportColumnConflicts({
      entity: 'node',
      candidate: text('foo_bar'),
      siblings,
    });

    expect(conflict?.kind === 'sibling' && conflict.sibling.id).toBe('v1');
  });

  describe('is symmetric', () => {
    const pairs: [ExportColumnVariable, ExportColumnVariable][] = [
      [text('foo_bar'), categorical('foo', 'bar')],
      [categorical('a_b', 'c'), categorical('a', 'b_c')],
      [text('pos_X'), layout('pos')],
      [layout('pos'), text('pos_screenSpaceY')],
      [layout('a_b'), categorical('a', 'b_x')],
      [text('foo_baz'), categorical('foo', 'bar')],
      [ordinal('rank', 1), text('rank_1')],
    ];

    it.each(pairs)('%j and %j', (left, right) => {
      expect(clashingColumns(left, [right])).toEqual(
        clashingColumns(right, [left]),
      );
    });
  });

  describe('reserved columns', () => {
    it('refuses the columns every node file writes for itself', () => {
      expect(conflicts(text('networkCanvasUUID'), [])).toEqual([
        {
          kind: 'reserved',
          column: 'networkCanvasUUID',
          origin: { kind: 'name' },
          reservedColumn: 'networkCanvasUUID',
          formats: ['csv', 'graphml'],
        },
      ]);
      expect(conflicts(text('nodeid'), [])).toEqual([
        {
          kind: 'reserved',
          column: 'nodeid',
          origin: { kind: 'name' },
          reservedColumn: 'nodeID',
          formats: ['csv'],
        },
      ]);
      expect(conflicts(text('label'), [])).toEqual([
        {
          kind: 'reserved',
          column: 'label',
          origin: { kind: 'name' },
          reservedColumn: 'label',
          formats: ['graphml'],
        },
      ]);
      expect(
        conflicts(text('networkCanvasEgoUUID'), []).map(({ kind }) => kind),
      ).toEqual(['reserved']);
    });

    // The CSV formatters key their header set by `_uid` and only print it as
    // `networkCanvasUUID`, so a variable called `_uid` would be merged into
    // that column and its own values lost.
    it('refuses the internal key a CSV column is printed from', () => {
      expect(conflicts(text('_uid'), []).map(({ kind }) => kind)).toEqual([
        'reserved',
      ]);
    });

    it('refuses the endpoint columns on edges only', () => {
      for (const name of ['from', 'to', 'edgeID', 'networkCanvasSourceUUID']) {
        expect(conflicts(text(name), [], 'edge')).not.toEqual([]);
        expect(conflicts(text(name), [], 'node')).toEqual([]);
      }
    });

    it('refuses the session columns on ego only', () => {
      for (const name of [
        'caseId',
        'networkCanvasCaseID',
        'sessionId',
        'networkCanvasSessionID',
        'protocolName',
        'networkCanvasProtocolName',
        'sessionStart',
        'sessionFinish',
        'sessionExported',
        'COMMIT_HASH',
        'networkCanvasInterviewLocale',
      ]) {
        expect(conflicts(text(name), [], 'ego')).not.toEqual([]);
        expect(conflicts(text(name), [], 'node')).toEqual([]);
      }
    });

    // Earlier protocols can name an ego variable after the interview locale;
    // only the column the export prints it under is reserved.
    it('accepts the interview locale property names that are not printed', () => {
      for (const name of ['interviewLocale', 'INTERVIEW_LOCALE']) {
        expect(conflicts(text(name), [], 'ego')).toEqual([]);
      }
    });

    it('refuses an option column that lands on a reserved column', () => {
      expect(conflicts(categorical('app', 'version'), [], 'ego')).toEqual([
        {
          kind: 'reserved',
          column: 'app_version',
          origin: { kind: 'option', value: 'version' },
          reservedColumn: 'APP_VERSION',
          formats: ['csv'],
        },
      ]);
    });
  });
});
