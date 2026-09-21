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
  current: boolean;
  onSelect: (descriptor: ResourceDescriptor) => void;
  disabled?: boolean;
}>;

// The name button is stretched over the card, making the whole card its target.
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
      className="focusable-within data-current:border-primary has-[button:enabled]:hover:border-primary relative flex h-full w-full min-w-0 flex-col overflow-hidden! border-2 border-transparent transition-[border-color] duration-200 has-[button:disabled]:opacity-50 motion-reduce:transition-none"
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
