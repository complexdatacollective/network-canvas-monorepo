import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { ResourceInspection } from '../types.ts';
import { RESOURCE_KIND_ICONS } from './resourceKinds.ts';
import ResourcePreview from './ResourcePreview.tsx';
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
  const Icon = RESOURCE_KIND_ICONS[descriptor.kind];
  // Audio is previewable but is a control rather than a picture, so it plays
  // below the summary instead of standing in the band.
  const framedKind =
    descriptor.kind === 'image' || descriptor.kind === 'video'
      ? descriptor.kind
      : undefined;

  /**
   * The mark for the resource's type, and over it the picture when there is
   * one. Both layers share the one grid cell, so a picture still resolving —
   * or one whose URL has lapsed — leaves the mark showing rather than a hole.
   * The band is sized rather than fixed, so a failure notice fits.
   */
  const band = (
    <>
      {/*
        Stands down when the picture is in the band, asked of the band rather
        than of a flag: whether there is a picture is the preview's own
        business, and it renews and drops the URL as leases lapse.
      */}
      <Icon
        aria-hidden="true"
        className="col-start-1 row-start-1 size-14 opacity-60 group-has-[img]:hidden group-has-[video]:hidden"
      />
      {framedKind !== undefined && (
        <ResourcePreview
          resourceId={descriptor.id}
          kind={framedKind}
          name={descriptor.name}
          className={cx(
            'col-start-1 row-start-1 w-full object-contain object-center',
            previewShape === 'canvas' ? 'size-full' : 'max-h-40',
          )}
        />
      )}
    </>
  );
  const bandClassName = cx(
    'group grid w-full shrink-0 place-items-center overflow-hidden rounded-t',
    previewShape === 'canvas' ? 'aspect-video' : 'min-h-40',
  );

  return (
    <Surface
      as="article"
      noContainer
      spacing="none"
      shadow="sm"
      className="flex w-full max-w-lg min-w-0 flex-col overflow-hidden!"
    >
      {/*
        A picture hangs in the interview's own ground rather than on the
        editor's paper, so transparency and dark edges read against the colour
        a participant will see them against. A mark has nothing to hang there.
      */}
      {framedKind !== undefined ? (
        <ThemedRegion theme="interview" className={bandClassName}>
          {band}
        </ThemedRegion>
      ) : (
        <div
          className={cx(bandClassName, 'bg-surface-2 text-surface-2-contrast')}
        >
          {band}
        </div>
      )}

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
