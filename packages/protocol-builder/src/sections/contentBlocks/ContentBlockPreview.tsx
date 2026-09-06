import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import ResourcePreview from '../../resources/components/ResourcePreview.tsx';
import type { RowPreviewProps } from '../rowRenderers.tsx';
import { contentBlockKind } from './contentBlockTypes.ts';

const messages = defineMessages({
  noContent: {
    id: 'protocolBuilder.contentBlock.previewEmpty',
    defaultMessage: 'This block has no content yet.',
    description:
      'Shown in the collapsed row of a page’s list of blocks when the researcher has not yet said what that piece of the page holds.',
  },
  unusable: {
    id: 'protocolBuilder.contentBlock.previewUnusable',
    defaultMessage:
      'This block’s resource is not in this protocol, or is not something a page can show.',
    description:
      'Shown in the collapsed row of a page’s list of blocks when that piece points at a file the protocol no longer holds, or at one a page cannot present — a roster of people, a map layer, a key.',
  },
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * How one block reads in the list when its dialog is closed.
 *
 * The block itself, as far as the editor can show it: prose is rendered as the
 * participant will read it, and media is played from the resource gateway
 * rather than from any host URL. A block naming a resource the protocol no
 * longer has says so, because that is the whole reason a researcher would be
 * looking at this list.
 */
export default function ContentBlockPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const kind = contentBlockKind(protocolContext, item);
  const content = asString(item.content) ?? '';

  if (kind === 'text') {
    return <RenderMarkdown render={<div />}>{content}</RenderMarkdown>;
  }

  if (kind === undefined) {
    return (
      <Badge>
        {intl.formatMessage(
          content === '' ? messages.noContent : messages.unusable,
        )}
      </Badge>
    );
  }

  return (
    <ResourcePreview
      resourceId={content}
      kind={kind}
      name={protocolContext.assets[content]?.name ?? content}
    />
  );
}
