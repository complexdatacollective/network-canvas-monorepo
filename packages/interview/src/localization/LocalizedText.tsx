'use client';

import { cloneElement, type ReactElement, type ReactNode } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import { useLocalizedString } from './ProtocolLocalizationProvider';

/**
 * Protocol-authored plain text, shown as the content of `render`. Its language
 * is the interview's, set once at the interview's boundary.
 */
export function LocalizedText({
  value,
  render,
}: {
  value: LocalizedString;
  render: ReactElement<{ children?: ReactNode }>;
}) {
  const { text } = useLocalizedString(value);
  return cloneElement(render, undefined, text);
}
