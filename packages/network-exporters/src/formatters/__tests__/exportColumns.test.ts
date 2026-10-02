import { DOMParser, MIME_TYPE } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  type ExportColumnEntity,
  type ExportColumnFormat,
  type ExportColumnVariable,
  reservedExportColumns,
  variableExportColumns,
} from '@codaco/shared-consts';

import { attributeListRows } from '../csv/attributeList';
import { edgeListRows } from '../csv/edgeList';
import { egoListRows } from '../csv/egoList';
import graphMLGenerator from '../graphml/createGraphML';
import {
  exportOptions,
  namesCodebook,
  namesSession,
  parseCsvRecord,
  prepareSession,
} from './namesFixture';

const variableColumns = (
  variables: Readonly<Record<string, ExportColumnVariable>> | undefined,
  format: ExportColumnFormat,
  useScreenLayoutCoordinates: boolean,
) =>
  Object.values(variables ?? {}).flatMap((variable) =>
    variableExportColumns(variable, { format, useScreenLayoutCoordinates }),
  );

const entityVariables = (entity: ExportColumnEntity) => {
  switch (entity) {
    case 'ego':
      return [namesCodebook.ego.variables];
    case 'node':
      return Object.values(namesCodebook.node).map(
        ({ variables }) => variables,
      );
    case 'edge':
      return Object.values(namesCodebook.edge).map(
        ({ variables }) => variables,
      );
  }
};

const expectedColumns = (
  entity: ExportColumnEntity,
  format: ExportColumnFormat,
  useScreenLayoutCoordinates: boolean,
) =>
  entityVariables(entity).flatMap((variables) =>
    variableColumns(variables, format, useScreenLayoutCoordinates),
  );

describe.each([true, false])(
  'every column the exporters write (screen layout coordinates: %s)',
  (useScreenLayoutCoordinates) => {
    const options = exportOptions(useScreenLayoutCoordinates);
    const network = prepareSession(namesSession());

    describe.each([
      ['attributeList', 'node', attributeListRows],
      ['edgeList', 'edge', edgeListRows],
      ['egoList', 'ego', egoListRows],
    ] as const)('%s CSV', (_, entity, rows) => {
      const headers = parseCsvRecord(
        [...rows(network, namesCodebook, options)].join(''),
      );
      const variableHeaders = expectedColumns(
        entity,
        'csv',
        useScreenLayoutCoordinates,
      );
      const reserved: readonly string[] = reservedExportColumns.csv[entity];

      it('writes only variable columns and reserved columns', () => {
        // The printed name of a built-in column is its internal property name
        // or a renamed spelling of it, and both are reserved.
        const unexplained = headers.filter(
          (header) =>
            !variableHeaders.includes(header) && !reserved.includes(header),
        );

        expect(unexplained).toEqual([]);
      });

      it('writes every variable column', () => {
        expect(headers).toEqual(expect.arrayContaining(variableHeaders));
      });

      it('writes no column twice', () => {
        expect(new Set(headers).size).toBe(headers.length);
      });
    });

    describe('GraphML', () => {
      let keys: {
        id: string | null;
        domain: string | null;
        column: string | null;
      }[] = [];

      beforeAll(async () => {
        const document = new DOMParser().parseFromString(
          await graphMLGenerator(
            network,
            namesCodebook,
            options,
            () => undefined,
          ),
          MIME_TYPE.XML_APPLICATION,
        );
        keys = Array.from(document.getElementsByTagName('key')).map((key) => ({
          id: key.getAttribute('id'),
          domain: key.getAttribute('for'),
          // The original name is kept in <desc> when attr.name had to change.
          column:
            key.getElementsByTagName('desc')[0]?.textContent ??
            key.getAttribute('attr.name'),
        }));
      });

      const declaredIn = (domain: string) =>
        keys.filter((key) => key.domain === domain).map(({ column }) => column);

      it.each([
        ['graph', 'ego'],
        ['node', 'node'],
        ['edge', 'edge'],
      ] as const)(
        'declares only variable columns and reserved columns for %s',
        (domain, entity) => {
          const variableKeys = expectedColumns(
            entity,
            'graphml',
            useScreenLayoutCoordinates,
          );
          const reserved: readonly string[] =
            reservedExportColumns.graphml[entity];

          const unexplained = declaredIn(domain).filter(
            (column) =>
              column === null ||
              (!variableKeys.includes(column) && !reserved.includes(column)),
          );

          expect(unexplained).toEqual([]);
        },
      );

      it.each([
        ['graph', 'ego'],
        ['node', 'node'],
        ['edge', 'edge'],
      ] as const)('declares every variable column of %s', (domain, entity) => {
        expect(declaredIn(domain)).toEqual(
          expect.arrayContaining(
            expectedColumns(entity, 'graphml', useScreenLayoutCoordinates),
          ),
        );
      });

      it('declares the keys that are for every element once, with reserved names', () => {
        const forAll = declaredIn('all');

        for (const entity of ['ego', 'node', 'edge'] as const) {
          const reserved: readonly string[] =
            reservedExportColumns.graphml[entity];
          for (const column of forAll) {
            expect(reserved).toContain(column);
          }
        }
        expect(new Set(forAll).size).toBe(forAll.length);
      });

      it('gives every key its own id', () => {
        const ids = keys.map(({ id }) => id);

        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  },
);

describe('the columns of names in other scripts, with spaces and punctuation', () => {
  const network = prepareSession(namesSession());
  const options = exportOptions(true);

  it('writes the variable name as the CSV header, quoted where CSV needs it', () => {
    const csv = [...attributeListRows(network, namesCodebook, options)].join(
      '',
    );
    const headers = parseCsvRecord(csv);

    expect(headers).toEqual(
      expect.arrayContaining([
        'Full name',
        '年齢 (years)',
        'map position_x',
        'map position_y',
        'map position_screenSpaceX',
        'map position_screenSpaceY',
        'Eye colour, "natural"_light blue',
        'Eye colour, "natural"_褐色',
        'Eye colour, "natural"_5',
        'Rank #',
        'Is this person close?',
        'Note / remarks',
      ]),
    );
    expect(csv).toContain('"Eye colour, ""natural""_light blue"');
  });

  it('writes the values under those headers', () => {
    const [headerRow, firstRow] = [
      ...attributeListRows(network, namesCodebook, options),
    ];
    const headers = parseCsvRecord(headerRow ?? '');
    const row = parseCsvRecord(firstRow ?? '');
    const cell = (header: string) => row[headers.indexOf(header)];

    expect(cell('Full name')).toBe('Dee');
    expect(cell('年齢 (years)')).toBe('40');
    expect(cell('Eye colour, "natural"_light blue')).toBe('true');
    expect(cell('Eye colour, "natural"_褐色')).toBe('false');
    expect(cell('Eye colour, "natural"_5')).toBe('true');
    expect(cell('map position_x')).toBe('0.25');
    expect(cell('Rank #')).toBe('2');
  });
});
