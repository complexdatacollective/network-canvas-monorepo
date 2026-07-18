import { describe, expect, it } from 'vitest';

import { createQuadrantsTemplate } from '~/model/templates';
import { DocumentParseError, parseDocument } from '~/svg/parse';
import { serializeDocument } from '~/svg/serialize';

const NC_NAMESPACE =
  'https://documentation.networkcanvas.com/xmlns/background-creator';

// Mirrors serialize.ts's base64EncodeUtf8 so fixtures exercise the same
// encoding the app produces, without importing an unexported helper.
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

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

  it('reports not-background-creator for text with no metadata marker at all', () => {
    expect(parseReason('this is just plain text, definitely not <markup')).toBe(
      'not-background-creator',
    );
  });

  it('reports not-background-creator for an SVG without our metadata', () => {
    expect(
      parseReason(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect x="0" y="0" width="10" height="10" /></svg>',
      ),
    ).toBe('not-background-creator');
  });

  it('reports invalid-metadata for corrupt base64', () => {
    // Single-character payload: valid base64 alphabet, invalid base64 length.
    expect(parseReason(svgWithMetadata('A'))).toBe('invalid-metadata');
  });

  it('reports invalid-metadata for corrupt JSON inside otherwise-valid base64', () => {
    expect(
      parseReason(svgWithMetadata(base64Utf8('{ this is not valid json }'))),
    ).toBe('invalid-metadata');
  });

  it('reports invalid-metadata for JSON that fails the schema', () => {
    expect(
      parseReason(svgWithMetadata(base64Utf8('{"version":2,"title":"x"}'))),
    ).toBe('invalid-metadata');
  });

  it('reopens metadata whose id uses single quotes and is not the first attribute', () => {
    const doc = createQuadrantsTemplate();
    const payload = base64Utf8(JSON.stringify(doc));
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">',
      // Attribute order swapped and single-quoted id — semantically identical to
      // our own output but as a re-serializing tool might rewrite it.
      "  <metadata data-tool='x' id='nc-background-creator'>",
      `    <nc:document xmlns:nc="${NC_NAMESPACE}">${payload}</nc:document>`,
      '  </metadata>',
      '</svg>',
    ].join('\n');
    expect(parseDocument(svg)).toEqual(doc);
  });
});
