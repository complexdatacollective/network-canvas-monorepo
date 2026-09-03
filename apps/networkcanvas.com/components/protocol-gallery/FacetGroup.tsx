import Tag from '@codaco/fresco-ui/Tag';
import { OverlineHeading } from '~/components/protocol-gallery/OverlineHeading';
import type { FacetOption } from '~/lib/galleryFacets';

export function FacetGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <OverlineHeading as="legend">{label}</OverlineHeading>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(({ value, count }) => (
          <Tag
            key={value}
            pressed={selected.includes(value)}
            onPressedChange={() => onToggle(value)}
            size="sm"
            className="whitespace-nowrap"
          >
            {value}
            <span className="font-normal opacity-70">{count}</span>
          </Tag>
        ))}
      </div>
    </fieldset>
  );
}
