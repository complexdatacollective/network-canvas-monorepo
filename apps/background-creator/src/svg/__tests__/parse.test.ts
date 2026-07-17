import { describe, expect, it } from 'vitest';

import { createQuadrantsTemplate } from '~/model/templates';
import { DocumentParseError, parseDocument } from '~/svg/parse';
import { serializeDocument } from '~/svg/serialize';

const NC_NAMESPACE =
  'https://documentation.networkcanvas.com/xmlns/background-creator';

function svgWithMetadata(payload: string): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">',
    '  <metadata id="nc-background-creator">',
    `    <nc:document xmlns:nc="${NC_NAMESPACE}">${payload}</nc:document>`,
    '  </metadata>',
    '</svg>',
  ].join('\n');
}

function parseReason(svgText: string): string | undefined {
  try {
    parseDocument(svgText);
  } catch (error) {
    return error instanceof DocumentParseError
      ? error.reason
      : `other: ${String(error)}`;
  }
  return undefined;
}

describe('parseDocument', () => {
  it('reopens a document produced by serializeDocument', () => {
    const doc = createQuadrantsTemplate();
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });

  it('reports invalid-svg for non-SVG text', () => {
    expect(parseReason('this is just plain text, definitely not <markup')).toBe(
      'invalid-svg',
    );
  });

  it('reports not-background-creator for an SVG without our metadata', () => {
    expect(
      parseReason(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect x="0" y="0" width="10" height="10" /></svg>',
      ),
    ).toBe('not-background-creator');
  });

  it('reports invalid-metadata for corrupt JSON', () => {
    expect(parseReason(svgWithMetadata('{ this is not valid json }'))).toBe(
      'invalid-metadata',
    );
  });

  it('reports invalid-metadata for JSON that fails the schema', () => {
    expect(parseReason(svgWithMetadata('{"version":2,"title":"x"}'))).toBe(
      'invalid-metadata',
    );
  });
});
