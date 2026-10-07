'use client';

import { cloneElement, type ReactElement, type ReactNode } from 'react';

import {
  presentationalTextProps,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import type { LocalizedString } from '@codaco/protocol-validation';

import { usePresentationalText } from './ProtocolLocalizationProvider';

/**
 * Protocol-authored plain text, shown as the content of `render`, which is
 * given the language and direction the text is written in.
 */
export function LocalizedText({
  value,
  render,
}: {
  value: LocalizedString;
  render: ReactElement<{ lang?: string; dir?: string; children?: ReactNode }>;
}) {
  const text = usePresentationalText(value);
  return cloneElement(
    render,
    presentationalTextProps(text),
    presentationalTextValue(text),
  );
}
