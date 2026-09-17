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
 * details, but two photographs are told apart by looking at them. It is named
 * by the resource's own name alone and described by the rest, so a reader who
 * cannot see the picture hears "skyline.png" rather than the whole card before
 * choosing it.
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
  const nameId = useId();
  const detailId = useId();

  return (
    <Surface
      as="button"
      type="button"
      noContainer
      spacing="none"
      shadow="sm"
      disabled={disabled}
      aria-current={current ? 'true' : undefined}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      onClick={() => onSelect(descriptor)}
      data-current={current || undefined}
      className="focusable data-current:border-primary ui-enabled:hover:border-primary ui-disabled:cursor-not-allowed ui-disabled:opacity-50 flex h-full w-full min-w-0 flex-col overflow-hidden! border-2 border-transparent text-left transition-[border-color] duration-200"
    >
      <ResourcePreviewBand descriptor={descriptor} />

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        {/*
          Not a heading: inside a control its level names nothing a reader can
          navigate to, and the control is already named by it.
        */}
        <span
          id={nameId}
          title={descriptor.name}
          className="line-clamp-2 text-lg leading-tight font-semibold wrap-anywhere"
        >
          {descriptor.name}
        </span>
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
