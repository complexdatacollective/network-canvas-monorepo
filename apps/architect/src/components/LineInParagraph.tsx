import type { ComponentType, ReactNode } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

/**
 * Protocol markdown as a view of protocol text draws it. Text of several
 * lines draws its own paragraphs. Text of one line draws none, since its
 * markdown draws only bold and italics (see `markdownElementsFor`), so it is
 * drawn inside one: the view sets one line as it sets each paragraph of
 * several, whatever lines the text's field holds.
 */
export const LineInParagraph = ({
  singleLine,
  paragraph: ParagraphElement = Paragraph,
  children,
}: {
  /** Whether the text's field holds one line. */
  singleLine: boolean;
  /** The element the view draws a paragraph with, if not `Paragraph`. */
  paragraph?: ComponentType<{ children?: ReactNode }>;
  children: ReactNode;
}) => (singleLine ? <ParagraphElement>{children}</ParagraphElement> : children);
