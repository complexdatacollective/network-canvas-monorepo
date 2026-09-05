import { Badge } from '@codaco/fresco-ui/Badge';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import ResourcePreview from '../../resources/components/ResourcePreview.tsx';
import type { RowPreviewProps } from '../rowRenderers.tsx';
import { contentBlockKind } from './contentBlockTypes.ts';

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
  const { protocolContext } = useStageEditorForm();
  const kind = contentBlockKind(protocolContext, item);
  const content = asString(item.content) ?? '';

  if (kind === 'text') {
    return <RenderMarkdown render={<div />}>{content}</RenderMarkdown>;
  }

  if (kind === undefined) {
    return (
      <Badge>
        {content === ''
          ? 'This block has no content yet.'
          : 'This block’s resource is not in this protocol, or is not something a page can show.'}
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
