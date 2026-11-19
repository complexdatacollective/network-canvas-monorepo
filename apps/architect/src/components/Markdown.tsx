import { memo } from 'react';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  type MarkdownBlockImages,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';

/**
 * Legacy protocols contain literal `>` characters that markdown would otherwise
 * parse as blockquotes on first load. Encoding them as `&gt;` (then restoring
 * `<br>`) forces them to render as plain paragraph text. Two successive replaces
 * rather than a single lookbehind regex because Safari does not support
 * lookbehind.
 */
const escapeAngleBracket = (value = '') =>
  value.replace(/>/g, '&gt;').replace(/<br&gt;/g, '<br>');

type MarkdownProps = {
  label: string;
  className?: string;
  allowedElements?: readonly string[];
  /** How a file the text holds as a block is drawn; without it, it is not. */
  blockImages?: MarkdownBlockImages;
};

const Markdown = ({
  label,
  className,
  allowedElements,
  blockImages,
}: MarkdownProps) => (
  <RenderMarkdown
    allowedElements={allowedElements ?? ALLOWED_MARKDOWN_SECTION_TAGS}
    blockImages={blockImages}
    render={<span className={className} />}
  >
    {escapeAngleBracket(label)}
  </RenderMarkdown>
);

export default memo(
  Markdown,
  (prevProps, nextProps) =>
    prevProps.label === nextProps.label &&
    prevProps.className === nextProps.className &&
    prevProps.allowedElements === nextProps.allowedElements &&
    prevProps.blockImages === nextProps.blockImages,
);
