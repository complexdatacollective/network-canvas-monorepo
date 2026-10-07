import { describe, expect, it } from 'vitest';

import {
  caseProperty,
  egoProperty,
  entityAttributesProperty,
  ncCaseProperty,
  ncInterviewLocaleProperty,
  ncProtocolNameProperty,
  ncSessionProperty,
  protocolName,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../../../input';
import { parseCsvRecord } from '../../__tests__/namesFixture';
import { egoListRows } from '../egoList';
import {
  mockCodebook,
  mockExportOptions,
  mockNetwork,
  mockNetwork2,
} from './mockObjects';

describe('egoListRows', () => {
  it('yields exactly one header and one data row', () => {
    const rows = Array.from(
      egoListRows(
        mockNetwork as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    expect(rows).toHaveLength(2);
    // printableAttribute maps caseProperty → ncCaseProperty in the header
    expect(rows[0]).toContain(ncCaseProperty);
    expect(rows[0]).toContain(ncSessionProperty);
    expect(rows[0]).toContain(ncProtocolNameProperty);
    // entityPrimaryKeyProperty → egoProperty in header
    expect(rows[0]).toContain(egoProperty);
    // session time fields pass through unchanged
    expect(rows[0]).toContain(sessionStartTimeProperty);
    expect(rows[0]).toContain(sessionFinishTimeProperty);
    expect(rows[0]).toContain(sessionExportTimeProperty);
    // processEntityVariables maps UUIDs to variable names from codebook
    expect(rows[0]).toContain('egoName');
    expect(rows[0]).toContain('egoAge');
    expect(rows[0]).toContain('boolVar');
  });

  it('data row contains session variable values', () => {
    const rows = Array.from(
      egoListRows(
        mockNetwork as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    // caseProperty value from mockNetwork.sessionVariables
    expect(rows[1]).toContain(mockNetwork.sessionVariables[caseProperty]);
    // protocolName value
    expect(rows[1]).toContain(mockNetwork.sessionVariables[protocolName]);
    // sessionProperty value
    expect(rows[1]).toContain(mockNetwork.sessionVariables[sessionProperty]);
  });

  it('data row contains ego attribute values', () => {
    const rows = Array.from(
      egoListRows(
        mockNetwork as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    // egoName attribute from mockNetwork.ego
    expect(rows[1]).toContain('Enzo');
    // egoAge attribute
    expect(rows[1]).toContain('40');
  });

  describe('interview locale', () => {
    const localeCell = (network: SessionWithResequencedIDs) => {
      const [header = '', row = ''] = Array.from(
        egoListRows(network, mockCodebook, mockExportOptions, () => undefined),
      );
      const headers = parseCsvRecord(header);
      return {
        headers,
        cell: parseCsvRecord(row)[headers.indexOf(ncInterviewLocaleProperty)],
      };
    };

    it('writes the locale under its own session column', () => {
      const { headers, cell } = localeCell(
        mockNetwork as SessionWithResequencedIDs,
      );
      expect(headers.filter((h) => h === ncInterviewLocaleProperty)).toEqual([
        ncInterviewLocaleProperty,
      ]);
      expect(cell).toBe('en-US');
    });

    it('leaves the cell empty when no locale was reported', () => {
      const { headers, cell } = localeCell(
        mockNetwork2 as SessionWithResequencedIDs,
      );
      expect(headers).toContain(ncInterviewLocaleProperty);
      expect(cell).toBe('');
    });
  });

  it('yields only header row when ego has no attributes', () => {
    const emptyNetwork = {
      ...mockNetwork,
      ego: { _uid: 'ego-id', [entityAttributesProperty]: {} },
      sessionVariables: {
        [caseProperty]: 'c1',
        [sessionProperty]: 's1',
        [protocolName]: 'p1',
        [sessionStartTimeProperty]: '100',
        [sessionFinishTimeProperty]: '200',
        [sessionExportTimeProperty]: '300',
        APP_VERSION: 'v1',
        COMMIT_HASH: 'abc',
      },
    };

    const rows = Array.from(
      egoListRows(
        emptyNetwork as unknown as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    // Always yields header + one data row (ego is a single entity, not a list)
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('egoName');
    expect(rows[0]).toContain('egoAge');
    expect(rows[0]).toContain('boolVar');
  });
});
