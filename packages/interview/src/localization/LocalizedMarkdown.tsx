'use client';

import type { ComponentProps } from 'react';

import {
  presentationalTextProps,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import type { LocalizedString } from '@codaco/protocol-validation';

import { usePresentationalText } from './ProtocolLocalizationProvider';

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
 * The text needs an element to carry its `lang` and `dir`; that block keeps
 * the space below it that its last paragraph would otherwise have given the
 * content that follows.
 */
export function LocalizedMarkdown({
  value,
  ...markdownOptions
}: LocalizedMarkdownProps) {
  const text = usePresentationalText(value);
  return (
    <RenderMarkdown
      {...markdownOptions}
      render={
        <div {...presentationalTextProps(text)} className="not-last:mb-[1em]" />
      }
    >
      {presentationalTextValue(text)}
    </RenderMarkdown>
  );
}
