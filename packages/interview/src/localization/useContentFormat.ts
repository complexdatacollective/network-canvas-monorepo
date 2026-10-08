'use client';

import { useMemo } from 'react';

import { type ContentFormat, createContentFormat } from './contentFormat';
import { useContentLocale } from './ProtocolLocalizationProvider';

/**
 * Formatters for protocol and participant values, in the language the
 * participant is reading the protocol in (see `useContentLocale`).
 */
export function useContentFormat(): ContentFormat {
  const locale = useContentLocale();
  return useMemo(() => createContentFormat(locale), [locale]);
}
