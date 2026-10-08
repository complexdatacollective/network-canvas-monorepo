'use client';

import { type ContentFormat, contentFormatFor } from './contentFormat';
import { useContentLocale } from './ProtocolLocalizationProvider';

/**
 * Formatters for protocol and participant values, in the language the
 * participant is reading the protocol in (see `useContentLocale`).
 */
export function useContentFormat(): ContentFormat {
  return contentFormatFor(useContentLocale());
}
