'use client';

import type { ComponentProps } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { LocalizedString } from '@codaco/protocol-validation';

import { DynamicMarkdown } from '../dynamicValues/DynamicText';
import { useLocalizedString } from './ProtocolLocalizationProvider';

type LocalizedMarkdownProps = Omit<
  ComponentProps<typeof RenderMarkdown>,
  'children' | 'render' | 'components' | 'rehypePlugins'
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
 *
 * Text that shows dynamic values has each value marked out, and inserted as
 * text after the markdown is rendered (see `DynamicMarkdown`).
 */
export function LocalizedMarkdown({
  value,
  ...markdownOptions
}: LocalizedMarkdownProps) {
  const { text, parts } = useLocalizedString(value);
  if (parts !== undefined) {
    return <DynamicMarkdown {...markdownOptions} parts={parts} />;
  }
  return <RenderMarkdown {...markdownOptions}>{text}</RenderMarkdown>;
}
