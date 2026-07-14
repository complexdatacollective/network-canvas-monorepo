import { memo } from 'react';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
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
};

const Markdown = ({ label, className, allowedElements }: MarkdownProps) => (
  <RenderMarkdown
    allowedElements={allowedElements ?? ALLOWED_MARKDOWN_SECTION_TAGS}
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
    prevProps.allowedElements === nextProps.allowedElements,
);
