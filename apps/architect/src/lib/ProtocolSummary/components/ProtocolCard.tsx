import { Pattern } from '@codaco/art';
import { ProtocolCard as ProtocolCardShell } from '@codaco/fresco-ui/ProtocolCard';
import Heading from '@codaco/fresco-ui/typography/Heading';
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
  <ProtocolCardShell
    background={
      <Pattern aria-hidden seed={name} className="absolute inset-0 size-full" />
    }
    gradientClassName="from-rich-black/25 via-platinum/50 to-platinum via-20% to-45%"
    className="max-w-[12cm] zoom-120 rounded-sm shadow-xl"
  >
    <div className="relative z-10 flex min-h-34 flex-col gap-5 p-7">
      {/* Reserve space above the heading so the dark title clears the
          gradient's dark top, mirroring the timeline card's controls row. */}
      <div className="min-h-14" aria-hidden />

      {/* break-words so a long name with no spaces (or an over-long word)
          wraps instead of overflowing the overflow-hidden card and being
          clipped; hyphens-auto adds nicer breaks where the browser supports
          it. The timeline card sidesteps this via a soft-wrapping textarea. */}
      <Heading
        level="h2"
        margin="none"
        className="wrap-break-word hyphens-auto"
      >
        {name}
      </Heading>

      {description && (
        <div className="text-sm wrap-break-word">{description}</div>
      )}

      <div className="text-navy-taupe/70 font-monospace mt-2.5 flex flex-col gap-1 text-xs tracking-widest uppercase">
        <span>Last Modified: {formatDate(lastModified)}</span>
        <span>Schema Version: {schemaVersion}</span>
      </div>
    </div>
  </ProtocolCardShell>
);

export default ProtocolCard;
