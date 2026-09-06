import { useAppIntl } from '@codaco/app-i18n/react';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import type { RowPreviewProps } from '../rowRenderers.tsx';
import { geospatialMessages } from './geospatialMessages.ts';

/**
 * How one geospatial prompt reads in the list.
 *
 * The question, as the participant will see it: prompt text is markdown, and a
 * researcher checking the order of their prompts is checking the wording, not
 * the syntax.
 */
export default function GeospatialPromptPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (text === '') {
    return (
      <span>{intl.formatMessage(geospatialMessages.promptPreviewEmpty)}</span>
    );
  }
  return <RenderMarkdown>{text}</RenderMarkdown>;
}
