'use client';

import type { ComponentProps } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { LocalizedString } from '@codaco/protocol-validation';

import { useLocalizedString } from './ProtocolLocalizationProvider';

type LocalizedMarkdownProps = Omit<
  ComponentProps<typeof RenderMarkdown>,
  'children' | 'render'
> & {
  value: LocalizedString;
};

/**
 * Protocol-authored markdown: the message is formatted in the language it
 * resolves to, and the formatted text is then rendered as markdown.
 *
 * The language is set once, at the interview's boundary, rather than per text:
 * the rendered blocks have no wrapper of their own, so they stay siblings of
 * the content around them and keep the spacing the typography's
 * `not-first:`/`not-last:` rules give them.
 */
export function LocalizedMarkdown({
  value,
  ...markdownOptions
}: LocalizedMarkdownProps) {
  const { text } = useLocalizedString(value);
  return <RenderMarkdown {...markdownOptions}>{text}</RenderMarkdown>;
}
