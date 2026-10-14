'use client';

import { cloneElement, type ReactElement, type ReactNode } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';

import { DynamicTextParts } from '../dynamicValues/DynamicText';
import { useLocalizedString } from './ProtocolLocalizationProvider';

/**
 * Protocol-authored plain text, shown as the content of `render`. Its language
 * is the interview's, set once at the interview's boundary. Text that shows
 * dynamic values has each value marked out.
 */
export function LocalizedText({
  value,
  render,
}: {
  value: LocalizedString;
  render: ReactElement<{ children?: ReactNode }>;
}) {
  const { text, parts } = useLocalizedString(value);
  return cloneElement(
    render,
    undefined,
    parts === undefined ? text : <DynamicTextParts parts={parts} />,
  );
}
