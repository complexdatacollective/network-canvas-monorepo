import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { ResourceDescriptor } from '../types.ts';
import { RESOURCE_KIND_ICONS } from './resourceKinds.ts';
import ResourcePreview from './ResourcePreview.tsx';

export type ResourcePreviewBandProps = Readonly<{
  descriptor: ResourceDescriptor;
  /**
   * How the picture is framed: a band it is fitted into, as the resource
   * library frames one, or the 16:9 interview canvas it will be drawn on,
   * which is what a researcher choosing a background needs to see.
   */
  shape?: 'thumbnail' | 'canvas';
  /** Draw the resource without controls, as `ResourcePreview`'s own option. */
  presentational?: boolean;
}>;

/**
 * The picture at the top of a resource's card: the mark for its type, and over
 * that the resource itself when there is something to show.
 *
 * Both layers share the one grid cell, so a picture still resolving — or one
 * whose URL has lapsed — leaves the mark showing rather than a hole. The band
 * is sized rather than fixed, so a failure notice fits.
 *
 * Audio is previewable but is a control rather than a picture, so it wears its
 * mark here and plays wherever the card puts its player.
 */
export default function ResourcePreviewBand({
  descriptor,
  shape = 'thumbnail',
  presentational = false,
}: ResourcePreviewBandProps) {
  const Icon = RESOURCE_KIND_ICONS[descriptor.kind];
  const framedKind =
    descriptor.kind === 'image' || descriptor.kind === 'video'
      ? descriptor.kind
      : undefined;

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
          presentational={presentational}
          className={cx(
            'col-start-1 row-start-1 w-full object-contain object-center',
            shape === 'canvas' ? 'size-full' : 'max-h-40',
          )}
        />
      )}
    </>
  );
  const className = cx(
    'group grid w-full shrink-0 place-items-center overflow-hidden rounded-t',
    shape === 'canvas' ? 'aspect-video' : 'min-h-40',
  );

  /*
    A picture hangs in the interview's own ground rather than on the editor's
    paper, so transparency and dark edges read against the colour a
    participant will see them against. A mark has nothing to hang there.
  */
  return framedKind !== undefined ? (
    <ThemedRegion theme="interview" className={className}>
      {band}
    </ThemedRegion>
  ) : (
    <div className={cx(className, 'bg-surface-2 text-surface-2-contrast')}>
      {band}
    </div>
  );
}
