import { parseBackgroundDocument } from '~/model/schema';
import type { BackgroundDocument } from '~/model/types';

export class DocumentParseError extends Error {
  readonly reason:
    | 'not-background-creator'
    | 'invalid-metadata'
    | 'invalid-svg';

  constructor(
    reason: 'not-background-creator' | 'invalid-metadata' | 'invalid-svg',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentParseError';
    this.reason = reason;
  }
}

export function parseDocument(svgText: string): BackgroundDocument {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');

  if (parsed.querySelector('parsererror') !== null) {
    throw new DocumentParseError(
      'invalid-svg',
      'The file could not be read as an SVG image.',
    );
  }

  const metadata = parsed.querySelector('[id="nc-background-creator"]');
  if (metadata === null) {
    throw new DocumentParseError(
      'not-background-creator',
      'This SVG does not contain Background Creator metadata, so it cannot be reopened for editing.',
    );
  }

  const payload = metadata.firstElementChild?.textContent;
  if (payload === null || payload === undefined || payload.trim() === '') {
    throw new DocumentParseError(
      'invalid-metadata',
      'The Background Creator metadata is empty.',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(payload);
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
