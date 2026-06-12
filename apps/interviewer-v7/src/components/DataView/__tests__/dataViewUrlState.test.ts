import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SORTING,
  parseDataViewSearch,
  protocolDataViewPath,
  serializeDataViewState,
} from '../dataViewUrlState';

describe('parseDataViewSearch', () => {
  it('returns defaults for an empty search string', () => {
    expect(parseDataViewSearch('')).toEqual({
      globalFilter: '',
      columnFilters: [],
      sorting: DEFAULT_SORTING,
    });
  });

  it('tolerates a leading question mark', () => {
    expect(parseDataViewSearch('?q=alpha').globalFilter).toBe('alpha');
  });

  it('parses every supported filter parameter', () => {
    const state = parseDataViewSearch(
      'q=alpha&caseId=case-1&protocol=Study%20A&protocol=Study%20B' +
        '&startedFrom=2026-01-01&startedTo=2026-01-31' +
        '&updatedFrom=2026-02-01&updatedTo=2026-02-28' +
        '&status=in-progress&status=complete&exported=false',
    );
    expect(state.globalFilter).toBe('alpha');
    expect(state.columnFilters).toEqual([
      { id: 'caseId', value: 'case-1' },
      { id: 'protocolName', value: ['Study A', 'Study B'] },
      { id: 'startedAt', value: { from: '2026-01-01', to: '2026-01-31' } },
      { id: 'updatedAt', value: { from: '2026-02-01', to: '2026-02-28' } },
      { id: 'progress', value: ['in-progress', 'complete'] },
      { id: 'exportedAt', value: false },
    ]);
  });

  it('parses sort and direction', () => {
    expect(parseDataViewSearch('sort=caseId&dir=asc').sorting).toEqual([
      { id: 'caseId', desc: false },
    ]);
    expect(parseDataViewSearch('sort=startedAt&dir=desc').sorting).toEqual([
      { id: 'startedAt', desc: true },
    ]);
  });

  it('drops malformed or unknown parameters', () => {
    const state = parseDataViewSearch(
      'sort=nope&dir=asc&status=bogus&exported=maybe' +
        '&startedFrom=2026-01-01&startedTo=not-a-date&updatedFrom=2026-02-01',
    );
    expect(state.sorting).toEqual(DEFAULT_SORTING);
    expect(state.columnFilters).toEqual([]);
  });

  it('rejects prototype keys as sort columns', () => {
    expect(parseDataViewSearch('sort=toString&dir=asc').sorting).toEqual(
      DEFAULT_SORTING,
    );
  });
});

describe('serializeDataViewState', () => {
  it('serializes the default state to an empty string', () => {
    expect(
      serializeDataViewState({
        globalFilter: '',
        columnFilters: [],
        sorting: DEFAULT_SORTING,
      }),
    ).toBe('');
  });

  it('omits the default sort and whitespace-only text filters', () => {
    expect(
      serializeDataViewState({
        globalFilter: '   ',
        columnFilters: [{ id: 'caseId', value: '  ' }],
        sorting: [{ id: 'updatedAt', desc: true }],
      }),
    ).toBe('');
  });

  it('round-trips a fully populated state', () => {
    const state = {
      globalFilter: 'alpha',
      columnFilters: [
        { id: 'caseId', value: 'case-1' },
        { id: 'protocolName', value: ['Study A', 'Study B'] },
        { id: 'startedAt', value: { from: '2026-01-01', to: '2026-01-31' } },
        { id: 'updatedAt', value: { from: '2026-02-01', to: '2026-02-28' } },
        { id: 'progress', value: ['in-progress', 'exported'] },
        { id: 'exportedAt', value: true },
      ],
      sorting: [{ id: 'caseId', desc: false }],
    };
    expect(parseDataViewSearch(serializeDataViewState(state))).toEqual(state);
  });

  it('writes a non-default sort with its direction', () => {
    expect(
      serializeDataViewState({
        globalFilter: '',
        columnFilters: [],
        sorting: [{ id: 'updatedAt', desc: false }],
      }),
    ).toBe('sort=updatedAt&dir=asc');
  });

  it('omits sort columns outside the allowlist', () => {
    expect(
      serializeDataViewState({
        globalFilter: '',
        columnFilters: [],
        sorting: [{ id: 'toString', desc: false }],
      }),
    ).toBe('');
  });
});

describe('protocolDataViewPath', () => {
  it('links to the data view filtered to the protocol', () => {
    const path = protocolDataViewPath('My Study (2026)');
    expect(path).toBe('/data?protocol=My+Study+%282026%29');
    expect(parseDataViewSearch(path.split('?')[1] ?? '')).toMatchObject({
      columnFilters: [{ id: 'protocolName', value: ['My Study (2026)'] }],
    });
  });

  it('falls back to the unfiltered data view without a name', () => {
    expect(protocolDataViewPath(undefined)).toBe('/data');
    expect(protocolDataViewPath('')).toBe('/data');
  });
});
