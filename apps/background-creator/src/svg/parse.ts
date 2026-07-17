import { parseBackgroundDocument } from '~/model/schema';
import type { BackgroundDocument } from '~/model/types';

export class DocumentParseError extends Error {
  readonly reason: 'not-background-creator' | 'invalid-metadata';

  constructor(
    reason: 'not-background-creator' | 'invalid-metadata',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentParseError';
    this.reason = reason;
  }
}

// Anchored to serializeDocument's own output shape, so opened files never go
// through DOMParser (parsing untrusted file contents as markup is the
// js/xss-through-dom sink this replaces): a `<metadata id="nc-background-creator">`
// element wraps a single `<nc:document>` element whose text content is a
// base64 payload. Isolating the metadata block first, then the document tag
// within it, keeps the match anchored without depending on attribute order or
// incidental whitespace elsewhere in the file.
const METADATA_BLOCK_PATTERN =
  /<metadata\s+id="nc-background-creator"[^>]*>([\s\S]*?)<\/metadata>/;
const DOCUMENT_TAG_PATTERN =
  /<nc:document[^>]*>\s*([A-Za-z0-9+/=\s]+?)\s*<\/nc:document>/;

export function parseDocument(svgText: string): BackgroundDocument {
  const metadataBlock = METADATA_BLOCK_PATTERN.exec(svgText)?.[1] ?? '';
  const documentMatch = DOCUMENT_TAG_PATTERN.exec(metadataBlock);
  if (documentMatch === null) {
    throw new DocumentParseError(
      'not-background-creator',
      'This SVG does not contain Background Creator metadata, so it cannot be reopened for editing.',
    );
  }

  const [, rawPayload = ''] = documentMatch;
  const base64 = rawPayload.replace(/\s+/g, '');

  let json: string;
  try {
    const bytes = Uint8Array.from(
      atob(base64),
      (char) => char.codePointAt(0) ?? 0,
    );
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentParseError(
      'invalid-metadata',
      'The Background Creator metadata is not valid base64 data.',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new DocumentParseError(
      'invalid-metadata',
      'The Background Creator metadata is not valid JSON.',
    );
  }

  try {
    return parseBackgroundDocument(data);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(
      'invalid-metadata',
      `The Background Creator metadata does not match the expected document format: ${detail}`,
    );
  }
}
