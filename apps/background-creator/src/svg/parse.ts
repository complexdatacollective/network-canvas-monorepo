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
// The `id` attribute may appear in any position and use single or double quotes
// (a re-serializing tool can legitimately reorder attributes or switch quote
// style without changing the document), so it is matched with an order- and
// quote-independent lookahead; group 2 captures the metadata contents.
const METADATA_BLOCK_PATTERN =
  /<metadata\b(?=[^>]*\sid\s*=\s*(["'])nc-background-creator\1)[^>]*>([\s\S]*?)<\/metadata>/;
const DOCUMENT_TAG_PATTERN =
  /<nc:document[^>]*>\s*([A-Za-z0-9+/=\s]+?)\s*<\/nc:document>/;

export function parseDocument(svgText: string): BackgroundDocument {
  const metadataBlock = METADATA_BLOCK_PATTERN.exec(svgText)?.[2] ?? '';
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
    // The schema failure surfaces in a user-facing dialog: a raw Zod issue
    // dump is unreadable there, so map the known pre-release format break
    // (numeric font trio / anchor fields) to a plain explanation and keep the
    // generic case to one sentence.
    if (isLegacyDocumentPayload(data)) {
      throw new DocumentParseError(
        'invalid-metadata',
        'This file was saved by an earlier version of Background Creator and can no longer be opened. Recreate the design in the current version.',
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(
      'invalid-metadata',
      `The Background Creator metadata does not match the expected document format.${summarizeSchemaFailure(detail)}`,
    );
  }
}

const LEGACY_TEXT_KEYS = ['fontMinPx', 'fontVmin', 'fontMaxPx', 'anchor'];

// True when the payload carries text-element fields from the pre-release
// document format that the current schema deliberately rejects.
function isLegacyDocumentPayload(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || !('elements' in data)) {
    return false;
  }
  const { elements } = data;
  if (!Array.isArray(elements)) return false;
  return elements.some(
    (el) =>
      typeof el === 'object' &&
      el !== null &&
      LEGACY_TEXT_KEYS.some((key) => key in el),
  );
}

// First issue only, capped — enough to orient without dumping the whole array.
function summarizeSchemaFailure(detail: string): string {
  const firstLine = detail
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('['));
  if (!firstLine) return '';
  const capped =
    firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  return ` (${capped})`;
}
