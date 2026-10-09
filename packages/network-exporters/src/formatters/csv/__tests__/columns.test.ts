import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  caseProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { FormattedSession } from '../../../input';
import type { ExportWarning } from '../../../output';
import {
  exportOptions,
  namesSession,
  parseCsvRecord,
  prepareSession,
} from '../../__tests__/namesFixture';
import { attributeListRows } from '../attributeList';
import { edgeListRows } from '../edgeList';
import { egoListRows } from '../egoList';

type Variables = NonNullable<
  NonNullable<Codebook['node']>[string]['variables']
>;

const personCodebook = (variables: Variables): Codebook => ({
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables,
    },
  },
});

const withNodes = (...nodes: NcNode[]): FormattedSession => ({
  ...namesSession(),
  nodes,
  edges: [],
});

const person = (attributes: NcNode[typeof entityAttributesProperty]) => ({
  [entityPrimaryKeyProperty]: `node-${Object.keys(attributes).join('-')}`,
  type: 'person',
  [entityAttributesProperty]: attributes,
});

// Each row as a map from header to cell, and the warnings the file reported.
const exportAttributeList = (
  codebook: Codebook,
  session: FormattedSession,
  useScreenLayoutCoordinates = false,
) => {
  const warnings: ExportWarning[] = [];
  const [headerRow = '', ...rows] = attributeListRows(
    prepareSession(session),
    codebook,
    exportOptions(useScreenLayoutCoordinates),
    (warning) => warnings.push(warning),
  );
  const headers = parseCsvRecord(headerRow);
  return {
    headers,
    rows: rows.map((row) => {
      const cells = parseCsvRecord(row);
      return new Map(headers.map((header, index) => [header, cells[index]]));
    }),
    warnings,
  };
};

const renamed = (
  variable: string,
  column: string,
  renamedTo: string,
): ExportWarning => ({
  kind: 'column-renamed',
  protocolName: 'protocol name',
  format: 'csv',
  entity: 'node',
  entityTypeName: 'Person',
  variable,
  column,
  renamedTo,
});

describe('the cells of categorical columns', () => {
  const rating = (...values: (string | number)[]) =>
    personCodebook({
      rating: {
        name: 'rating',
        label: 'Rating',
        type: 'categorical',
        options: values.map((value) => ({
          label: { en: String(value) },
          value,
        })),
      },
    });

  it('marks the selected options and only those, without matching substrings', () => {
    const { rows } = exportAttributeList(
      rating('male', 'female', 'non-binary'),
      withNodes(person({ rating: ['female'] })),
    );

    expect(rows[0]?.get('rating_male')).toBe('false');
    expect(rows[0]?.get('rating_female')).toBe('true');
    expect(rows[0]?.get('rating_non-binary')).toBe('false');
  });

  it('tells numbers apart from numbers that contain them', () => {
    const { rows } = exportAttributeList(
      rating(1, 10, 100),
      withNodes(person({ rating: [10] })),
    );

    expect(rows[0]?.get('rating_1')).toBe('false');
    expect(rows[0]?.get('rating_10')).toBe('true');
    expect(rows[0]?.get('rating_100')).toBe('false');
  });

  it('marks nothing when nothing is selected', () => {
    const { rows } = exportAttributeList(
      rating('a', 'b'),
      withNodes(person({ rating: [] })),
    );

    expect(rows[0]?.get('rating_a')).toBe('false');
    expect(rows[0]?.get('rating_b')).toBe('false');
  });
});

describe('a variable column with the name of a built-in column', () => {
  it('is renamed, keeps its values, and is reported once', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        id: { name: 'nodeID', label: 'Node ID', type: 'text' },
        uid: { name: '_uid', label: 'Uid', type: 'text' },
        ego: {
          name: 'networkCanvasUUID',
          label: 'Network canvas UUID',
          type: 'text',
        },
      }),
      withNodes(person({ id: 'A1', uid: 'U1', ego: 'E1' })),
    );

    expect(headers).toEqual([
      'nodeID',
      'networkCanvasEgoUUID',
      'networkCanvasUUID',
      'nodeID_2',
      '_uid_2',
      'networkCanvasUUID_2',
    ]);
    expect(rows[0]?.get('nodeID')).toBe('1');
    expect(rows[0]?.get('networkCanvasUUID')).toBe('node-id-uid-ego');
    expect(rows[0]?.get('nodeID_2')).toBe('A1');
    expect(rows[0]?.get('_uid_2')).toBe('U1');
    expect(rows[0]?.get('networkCanvasUUID_2')).toBe('E1');
    expect(warnings).toEqual([
      renamed('nodeID', 'nodeID', 'nodeID_2'),
      renamed('_uid', '_uid', '_uid_2'),
      renamed('networkCanvasUUID', 'networkCanvasUUID', 'networkCanvasUUID_2'),
    ]);
  });
});

describe('variable columns with the same name', () => {
  it('leaves the first in codebook order, and renames the later one', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        text: { name: 'colour_red', label: 'Colour red', type: 'text' },
        choice: {
          name: 'colour',
          label: 'Colour',
          type: 'categorical',
          options: [
            { label: { en: 'Red' }, value: 'red' },
            { label: { en: 'Blue' }, value: 'blue' },
          ],
        },
      }),
      withNodes(person({ text: 'crimson', choice: ['red'] })),
    );

    expect(headers.slice(3)).toEqual([
      'colour_red',
      'colour_red_2',
      'colour_blue',
    ]);
    expect(rows[0]?.get('colour_red')).toBe('crimson');
    expect(rows[0]?.get('colour_red_2')).toBe('true');
    expect(rows[0]?.get('colour_blue')).toBe('false');
    expect(warnings).toEqual([renamed('colour', 'colour_red', 'colour_red_2')]);
  });

  it('never gives a renamed column the name of another column', () => {
    const { headers, rows } = exportAttributeList(
      personCodebook({
        first: { name: 'nodeID', label: 'Node ID', type: 'text' },
        second: { name: 'nodeID_2', label: 'Node ID 2', type: 'text' },
      }),
      withNodes(person({ first: 'one', second: 'two' })),
    );

    expect(headers.slice(3)).toEqual(['nodeID_3', 'nodeID_2']);
    expect(rows[0]?.get('nodeID_3')).toBe('one');
    expect(rows[0]?.get('nodeID_2')).toBe('two');
  });

  it('compares names after NFC normalisation', () => {
    const composed = 'x_Caf\u00e9';
    const decomposed = 'x_Cafe\u0301';
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        first: { name: composed, label: 'Café', type: 'text' },
        second: {
          name: 'x',
          label: 'X',
          type: 'categorical',
          options: [{ label: { en: 'Café' }, value: 'Cafe\u0301' }],
        },
      }),
      withNodes(person({ first: 'one', second: ['Cafe\u0301'] })),
    );

    expect(headers.slice(3)).toEqual([composed, `${decomposed}_2`]);
    expect(rows[0]?.get(composed)).toBe('one');
    expect(rows[0]?.get(`${decomposed}_2`)).toBe('true');
    expect(warnings).toEqual([renamed('x', decomposed, `${decomposed}_2`)]);
  });

  it('compares headers as written, with the formula guard', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        formula: { name: '=total', label: 'Total', type: 'text' },
        guarded: { name: "'=total", label: 'Total', type: 'text' },
      }),
      withNodes(person({ formula: 'one', guarded: 'two' })),
    );

    expect(headers.slice(3)).toEqual(["'=total", "'=total_2"]);
    expect(rows[0]?.get("'=total")).toBe('one');
    expect(rows[0]?.get("'=total_2")).toBe('two');
    expect(warnings).toEqual([renamed("'=total", "'=total", "'=total_2")]);
  });

  it('does not rename names that differ only in case', () => {
    const { headers, warnings } = exportAttributeList(
      personCodebook({
        lower: { name: 'age', label: 'Age', type: 'number' },
        upper: { name: 'Age', label: 'Age', type: 'number' },
      }),
      withNodes(person({ lower: 1, upper: 2 })),
    );

    expect(headers.slice(3)).toEqual(['age', 'Age']);
    expect(warnings).toEqual([]);
  });

  it('tells apart two options of one variable that write the same column', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        rating: {
          name: 'rating',
          label: 'Rating',
          type: 'categorical',
          options: [
            { label: { en: 'One' }, value: 1 },
            { label: { en: 'One, as text' }, value: '1' },
          ],
        },
      }),
      withNodes(person({ rating: ['1'] })),
    );

    expect(headers.slice(3)).toEqual(['rating_1', 'rating_1_2']);
    expect(rows[0]?.get('rating_1')).toBe('false');
    expect(rows[0]?.get('rating_1_2')).toBe('true');
    expect(warnings).toEqual([renamed('rating', 'rating_1', 'rating_1_2')]);
  });

  it('renames an attribute the codebook does not declare after every variable', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        name: { name: 'name', label: 'Name', type: 'text' },
      }),
      withNodes(person({ nickname: 'Dee', name: 'Deirdre' })),
    );

    expect(headers.slice(3)).toEqual(['name', 'nickname']);
    expect(rows[0]?.get('name')).toBe('Deirdre');

    const clash = exportAttributeList(
      personCodebook({
        name: { name: 'nickname', label: 'Nickname', type: 'text' },
      }),
      withNodes(person({ nickname: 'Dee', name: 'Deirdre' })),
    );

    expect(clash.headers.slice(3)).toEqual(['nickname', 'nickname_2']);
    expect(clash.rows[0]?.get('nickname')).toBe('Deirdre');
    expect(clash.rows[0]?.get('nickname_2')).toBe('Dee');
    expect(clash.warnings).toEqual([
      renamed('nickname', 'nickname', 'nickname_2'),
    ]);
    expect(headers).not.toContain('nickname_2');
    expect(warnings).toEqual([]);
  });

  it('renames layout columns too, when the screen-space columns are written', () => {
    const { headers, rows, warnings } = exportAttributeList(
      personCodebook({
        text: {
          name: 'pos_screenSpaceX',
          label: 'Pos screen space x',
          type: 'text',
        },
        layout: { name: 'pos', label: 'Pos', type: 'layout' },
      }),
      withNodes(person({ text: 'note', layout: { x: 0.5, y: 0.25 } })),
      true,
    );

    expect(headers.slice(3)).toEqual([
      'pos_screenSpaceX',
      'pos_x',
      'pos_y',
      'pos_screenSpaceX_2',
      'pos_screenSpaceY',
    ]);
    expect(rows[0]?.get('pos_screenSpaceX')).toBe('note');
    expect(rows[0]?.get('pos_screenSpaceX_2')).toBe('960.00');
    expect(warnings).toEqual([
      renamed('pos', 'pos_screenSpaceX', 'pos_screenSpaceX_2'),
    ]);
  });
});

describe('a file with no nodes', () => {
  it('lists the columns of every node type, renamed as each type would be', () => {
    const codebook: Codebook = {
      node: {
        person: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            id: { name: 'nodeID', label: 'Node ID', type: 'text' },
            name: { name: 'name', label: 'Name', type: 'text' },
          },
        },
        place: {
          name: 'Place',
          label: { en: 'Place' },
          color: 'node-color-seq-2',
          shape: { default: 'square' },
          variables: {
            name: { name: 'name', label: 'Name', type: 'text' },
          },
        },
      },
    };
    const { headers, rows, warnings } = exportAttributeList(
      codebook,
      withNodes(),
    );

    expect(headers.slice(3)).toEqual(['nodeID_2', 'name']);
    expect(rows).toEqual([]);
    expect(warnings).toEqual([renamed('nodeID', 'nodeID', 'nodeID_2')]);
  });
});

describe('the edge list', () => {
  it('renames a variable named after a built-in column', () => {
    const warnings: ExportWarning[] = [];
    const codebook: Codebook = {
      edge: {
        knows: {
          name: 'Knows',
          label: { en: 'Knows' },
          color: 'edge-color-seq-1',
          variables: {
            from: { name: 'from', label: 'From', type: 'text' },
          },
        },
      },
    };
    const [headerRow = '', row = ''] = edgeListRows(
      prepareSession({
        ...withNodes(person({}), { ...person({}), _uid: 'node-b' }),
        edges: [
          {
            [entityPrimaryKeyProperty]: 'edge-a',
            from: 'node-',
            to: 'node-b',
            type: 'knows',
            [entityAttributesProperty]: { from: 'school' },
          },
        ],
      }),
      codebook,
      exportOptions(false),
      (warning) => warnings.push(warning),
    );
    const headers = parseCsvRecord(headerRow);
    const cells = parseCsvRecord(row);

    expect(headers.at(-1)).toBe('from_2');
    expect(cells.at(-1)).toBe('school');
    expect(cells[headers.indexOf('from')]).toBe('1');
    expect(warnings).toEqual([
      {
        kind: 'column-renamed',
        protocolName: 'protocol name',
        format: 'csv',
        entity: 'edge',
        entityTypeName: 'Knows',
        variable: 'from',
        column: 'from',
        renamedTo: 'from_2',
      },
    ]);
  });
});

describe('the ego list', () => {
  it('renames variables named after either spelling of a built-in column', () => {
    const warnings: ExportWarning[] = [];
    const codebook: Codebook = {
      ego: {
        variables: {
          internal: { name: 'caseId', label: 'Case id', type: 'text' },
          printed: {
            name: 'networkCanvasCaseID',
            label: 'Network canvas case ID',
            type: 'text',
          },
        },
      },
    };
    const session = namesSession();
    const [headerRow = '', row = ''] = egoListRows(
      prepareSession({
        ...session,
        ego: {
          [entityPrimaryKeyProperty]: 'ego-1',
          [entityAttributesProperty]: { internal: 'mine', printed: 'theirs' },
        },
      }),
      codebook,
      exportOptions(false),
      (warning) => warnings.push(warning),
    );
    const headers = parseCsvRecord(headerRow);
    const cells = parseCsvRecord(row);
    const cell = (header: string) => cells[headers.indexOf(header)];

    expect(cell('networkCanvasCaseID')).toBe(
      session.sessionVariables[caseProperty],
    );
    expect(cell('caseId_2')).toBe('mine');
    expect(cell('networkCanvasCaseID_2')).toBe('theirs');
    expect(headers).not.toContain('caseId');
    expect(warnings.map((warning) => warning.kind)).toEqual([
      'column-renamed',
      'column-renamed',
    ]);
    expect(warnings[0]).not.toHaveProperty('entityTypeName');
  });
});
