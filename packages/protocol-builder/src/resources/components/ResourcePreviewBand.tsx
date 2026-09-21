import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { ResourceDescriptor } from '../types.ts';
import { RESOURCE_KIND_ICONS } from './resourceKinds.ts';
import ResourcePreview from './ResourcePreview.tsx';

export type ResourcePreviewBandProps = Readonly<{
  descriptor: ResourceDescriptor;
  shape?: 'thumbnail' | 'canvas';
  presentational?: boolean;
}>;

// Mark and picture share one grid cell, so a lapsed or loading picture leaves
// the mark showing. Audio is a control, not a picture, so it shows its mark.
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
      {/* Asked of the band: the preview drops its URL as leases lapse. */}
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

  // On the interview's ground, so transparency reads as a participant sees it.
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
