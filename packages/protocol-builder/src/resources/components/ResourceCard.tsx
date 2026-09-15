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
   * How the picture above the card is framed.
   *
   * `thumbnail` is a band the picture is fitted into, as the protocol's
   * resource library frames one. `canvas` is the interview canvas the picture
   * will be drawn on — 16:9, the picture fitted inside it — which is the only
   * way a researcher choosing a background can see what a participant will:
   * a background sized for a phone shown in a landscape band tells them
   * nothing about how much of it the canvas keeps.
   */
  previewShape?: 'thumbnail' | 'canvas';
  /** The card's action row: what a researcher may do with this resource. */
  actions?: ReactNode;
}>;

/**
 * One resource, as a card.
 *
 * The same card the protocol's resource library shows — a picture of the
 * resource over its name, its type and what the host read out of it — so a
 * researcher choosing a resource for a stage field recognises what they
 * chose. Deliberately not the library's own card: that one belongs to
 * Architect and this package cannot see it, so the two share the vocabulary
 * they must agree on (`RESOURCE_KIND_ICONS`, `RESOURCE_KIND_BADGE_COLORS`)
 * rather than a component.
 *
 * A resource with nothing to show — a roster, an API key, an audio file, an
 * image whose URL has not arrived — shows the mark for its type instead, which
 * is what the picture band is painted behind in every case.
 */
export default function ResourceCard({
  inspection,
  previewShape = 'thumbnail',
  actions,
}: ResourceCardProps) {
  const { descriptor } = inspection;
  const Icon = RESOURCE_KIND_ICONS[descriptor.kind];
  /**
   * The kind the band itself can show a picture of, or `undefined` when there
   * is none. Audio is previewable but is a control rather than a picture, so
   * it plays below the summary instead of standing in the band.
   */
  const framedKind =
    descriptor.kind === 'image' || descriptor.kind === 'video'
      ? descriptor.kind
      : undefined;

  /**
   * The band, which is the same band the protocol's resource library draws:
   * the mark for the resource's type, and over it the picture when there is
   * one. Both layers share the one grid cell, so a picture still resolving —
   * or one whose URL has lapsed — leaves the mark showing rather than a hole.
   *
   * The band is sized rather than fixed. A picture is held to the library's
   * own band height; anything else the preview puts here (a failure and its
   * retry) makes the band as tall as it needs to be, because a notice a
   * researcher cannot read is worse than a band of an unexpected height.
   */
  const band = (
    <>
      {/*
        Stands down the moment the picture itself is in the band. Asked of the
        band rather than of a flag, because whether there is a picture to show
        is the preview's own business — it resolves a URL, renews it, and drops
        it again when it lapses — and a flag mirrored up here would be a second
        answer to that question, wrong for as long as it took to catch up.
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
        A picture is the participant's, so it hangs in the interview's own
        ground rather than on the editor's paper: an image with transparency,
        or one whose edges are dark, is the colour a participant will see it
        against and not the colour this form happens to be painted in. A
        resource with no picture has nothing to hang there, so its mark sits on
        the editor's own recessed surface instead — which is exactly how the
        protocol's resource library divides the two.
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
