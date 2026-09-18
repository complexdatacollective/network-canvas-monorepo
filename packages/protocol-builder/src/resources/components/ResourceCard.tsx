import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';

import type { ResourceInspection } from '../types.ts';
import ResourcePreview from './ResourcePreview.tsx';
import ResourcePreviewBand from './ResourcePreviewBand.tsx';
import ResourceSummary from './ResourceSummary.tsx';

export type ResourceCardProps = Readonly<{
  inspection: ResourceInspection;
  /**
   * How the picture above the card is framed: a band it is fitted into, as the
   * resource library frames one, or the 16:9 interview canvas it will be drawn
   * on, which is what a researcher choosing a background needs to see.
   */
  previewShape?: 'thumbnail' | 'canvas';
  /** The card's action row: what a researcher may do with this resource. */
  actions?: ReactNode;
}>;

/**
 * One resource, as a card: a picture of it over its name, its type and what
 * the host read out of it. Not the resource library's own card, which belongs
 * to Architect and this package cannot see — the two share the vocabulary they
 * must agree on (`RESOURCE_KIND_ICONS`, `RESOURCE_KIND_BADGE_COLORS`) instead.
 *
 * A resource with nothing to show wears the mark for its type.
 */
export default function ResourceCard({
  inspection,
  previewShape = 'thumbnail',
  actions,
}: ResourceCardProps) {
  const { descriptor } = inspection;

  return (
    <Surface
      as="article"
      noContainer
      spacing="none"
      shadow="sm"
      className="flex w-full max-w-lg min-w-0 flex-col overflow-hidden!"
    >
      <ResourcePreviewBand descriptor={descriptor} shape={previewShape} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <ResourceSummary inspection={inspection} />
        {descriptor.kind === 'audio' && (
          <ResourcePreview
            resourceId={descriptor.id}
            kind={descriptor.kind}
            name={descriptor.name}
            className="w-full"
          />
        )}
        {actions !== undefined && (
          <div className="mt-auto flex flex-wrap gap-2">{actions}</div>
        )}
      </div>
    </Surface>
  );
}
