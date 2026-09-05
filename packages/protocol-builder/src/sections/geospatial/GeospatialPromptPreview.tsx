import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import type { RowPreviewProps } from '../rowRenderers.tsx';

const EMPTY = 'This prompt has no question yet.';

/**
 * How one geospatial prompt reads in the list.
 *
 * The question, as the participant will see it: prompt text is markdown, and a
 * researcher checking the order of their prompts is checking the wording, not
 * the syntax.
 */
export default function GeospatialPromptPreview({ item }: RowPreviewProps) {
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (text === '') return <span>{EMPTY}</span>;
  return <RenderMarkdown>{text}</RenderMarkdown>;
}
