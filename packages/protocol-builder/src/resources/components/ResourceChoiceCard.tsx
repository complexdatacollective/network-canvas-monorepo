import { useId } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { ResourceDescriptor } from '../types.ts';
import {
  formatByteLength,
  RESOURCE_KIND_BADGE_COLORS,
  resourceKindLabel,
  resourceStatusLabel,
} from './resourceKinds.ts';
import ResourcePreviewBand from './ResourcePreviewBand.tsx';

export type ResourceChoiceCardProps = Readonly<{
  descriptor: ResourceDescriptor;
  /** Whether the field being edited already holds this resource. */
  current: boolean;
  onSelect: (descriptor: ResourceDescriptor) => void;
  disabled?: boolean;
}>;

/**
 * One resource in the browser's library, as the thing a researcher chooses: a
 * picture of it over its name, its type and whether the protocol has saved it
 * yet.
 *
 * The whole card is the control, because the picture is what a researcher
 * picks a resource by — two rosters with similar names are told apart by their
 * details, but two photographs are told apart by looking at them. The control
 * itself is the resource's name, stretched over the card: a button holds only
 * phrasing content and nothing operable, and the card holds a picture and
 * badges. It is described by the badges, so a reader who cannot see the
 * picture hears "skyline.png" before choosing it rather than the whole card.
 *
 * `ResourceCard` is the other half of this pair: what a field shows for the
 * resource it already holds, in full, with everything `inspect` read out of
 * it. Here there is only the library listing to draw on, and one card per
 * resource to draw it in.
 */
export default function ResourceChoiceCard({
  descriptor,
  current,
  onSelect,
  disabled = false,
}: ResourceChoiceCardProps) {
  const intl = useAppIntl();
  const detailId = useId();

  return (
    <Surface
      noContainer
      spacing="none"
      shadow="sm"
      data-current={current || undefined}
      className="focusable-within data-current:border-primary has-[button:enabled]:hover:border-primary relative flex h-full w-full min-w-0 flex-col overflow-hidden! border-2 border-transparent transition-[border-color] duration-200 has-[button:disabled]:opacity-50"
    >
      <ResourcePreviewBand descriptor={descriptor} presentational />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <button
          type="button"
          disabled={disabled}
          aria-current={current ? 'true' : undefined}
          aria-describedby={detailId}
          onClick={() => onSelect(descriptor)}
          title={descriptor.name}
          className="cursor-pointer text-left text-lg leading-tight font-semibold outline-none after:absolute after:inset-0 disabled:cursor-not-allowed"
        >
          <span className="line-clamp-2 wrap-anywhere">{descriptor.name}</span>
        </button>
        <div
          id={detailId}
          className="mt-auto flex flex-wrap items-center gap-2"
        >
          {/*
            The type's own colour, which is what the protocol's resource
            library badges it in.
          */}
          <Badge
            variant="outline"
            color={RESOURCE_KIND_BADGE_COLORS[descriptor.kind]}
          >
            {resourceKindLabel(descriptor.kind, intl)}
          </Badge>
          <Badge>{resourceStatusLabel(descriptor.status, intl)}</Badge>
          {descriptor.byteLength !== undefined && (
            <Paragraph intent="smallText" emphasis="muted" margin="none">
              {formatByteLength(descriptor.byteLength, intl)}
            </Paragraph>
          )}
        </div>
      </div>
    </Surface>
  );
}
