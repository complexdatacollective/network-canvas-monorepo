import { describe, expect, it } from 'vitest';

import {
  getMapboxTokenId,
  RETIRED_MAPBOX_TOKEN_IDS,
  TESTING_MAPBOX_TOKEN,
} from '../testingMapboxToken';
import { buildMapboxToken } from './buildMapboxToken';

describe('getMapboxTokenId()', () => {
  it('reads the id out of a token shaped the way Mapbox shapes them', () => {
    expect(getMapboxTokenId(buildMapboxToken('cmabc123def456'))).toBe(
      'cmabc123def456',
    );
  });

  it('resolves the current testing token to an id that is not retired', () => {
    const id = getMapboxTokenId(TESTING_MAPBOX_TOKEN);

    expect(id).toEqual(expect.any(String));
    expect(RETIRED_MAPBOX_TOKEN_IDS).not.toContain(id);
  });

  it('lists at least one retired id, none of them the current token', () => {
    expect(RETIRED_MAPBOX_TOKEN_IDS.length).toBeGreaterThan(0);
    for (const id of RETIRED_MAPBOX_TOKEN_IDS) {
      expect(id).toMatch(/^[a-z0-9]+$/);
      expect(getMapboxTokenId(buildMapboxToken(id))).toBe(id);
    }
  });

  it('accepts the standard alphabet with padding as well as unpadded base64url', () => {
    // These bytes need both '/' and '+' in standard base64, and the payload
    // length needs padding, so both translations are actually exercised.
    const id = '???>>>';
    const standardPadded = btoa(JSON.stringify({ u: 'networkcanvas', a: id }));
    expect(standardPadded).toMatch(/\+/);
    expect(standardPadded).toMatch(/\//);
    expect(standardPadded).toMatch(/=$/);
    const urlUnpadded = standardPadded
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(getMapboxTokenId(['pk', standardPadded, 'sig'].join('.'))).toBe(id);
    expect(getMapboxTokenId(['pk', urlUnpadded, 'sig'].join('.'))).toBe(id);
  });

  it('decodes a non-ASCII account name without corrupting the id', () => {
    expect(getMapboxTokenId(buildMapboxToken('cmid', 'réseau'))).toBe('cmid');
  });

  it.each([
    ['empty', ''],
    ['no dots', 'pk'],
    ['one segment after the prefix', 'pk.abc'],
    ['four segments', 'pk.some.other.token'],
    ['empty payload', 'pk..sig'],
    ['payload that is not base64', 'pk.!!!.sig'],
    ['payload that is not JSON', ['pk', btoa('not json'), 'sig'].join('.')],
    ['JSON string payload', ['pk', btoa('"a string"'), 'sig'].join('.')],
    ['JSON null payload', ['pk', btoa('null'), 'sig'].join('.')],
    [
      'JSON object without an id',
      ['pk', btoa(JSON.stringify({ u: 'networkcanvas' })), 'sig'].join('.'),
    ],
    [
      'JSON object whose id is not a string',
      ['pk', btoa(JSON.stringify({ u: 'networkcanvas', a: 42 })), 'sig'].join(
        '.',
      ),
    ],
  ])('returns null without throwing for %s', (_label, value) => {
    expect(getMapboxTokenId(value)).toBeNull();
  });
});
