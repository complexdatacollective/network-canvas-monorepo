import { Pattern } from '@codaco/art';

type ProtocolCardProps = {
  name: string;
  description?: string | null;
  lastModified: string | null;
  schemaVersion: number;
};

const formatDate = (timeString: string | null) => {
  if (!timeString) return null;
  const date = new Date(timeString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined);
};

const ProtocolCard = ({
  name,
  description = null,
  lastModified,
  schemaVersion,
}: ProtocolCardProps) => (
  <div className="text-navy-taupe bg-platinum border-platinum-dark relative w-full max-w-[12cm] zoom-120 overflow-hidden rounded border shadow-xl">
    {/* The pattern fills the whole card; a top-to-bottom gradient lets it read
        at the top, then fades to opaque platinum so the content below stays
        legible. Mirrors the timeline's ProtocolInfoCard. */}
    <Pattern aria-hidden seed={name} className="absolute inset-0 size-full" />
    <div className="from-rich-black/25 via-platinum/50 to-platinum absolute inset-0 size-full bg-linear-to-b via-20% to-45%" />

    <div className="relative z-10 flex min-h-(--space-6xl) flex-col gap-(--space-md) p-(--space-lg)">
      {/* Reserve space above the heading so the dark title clears the
          gradient's dark top, mirroring the timeline card's controls row. */}
      <div className="min-h-(--space-2xl)" aria-hidden />

      <h2 className="m-0 hyphens-auto">{name}</h2>

      {description && <div className="text-sm">{description}</div>}

      <div className="text-navy-taupe/70 font-monospace mt-(--space-sm) flex flex-col gap-(--space-xs) text-xs tracking-widest uppercase">
        <span>Last Modified: {formatDate(lastModified)}</span>
        <span>Schema Version: {schemaVersion}</span>
      </div>
    </div>
  </div>
);

export default ProtocolCard;
