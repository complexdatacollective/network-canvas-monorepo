import { Pattern } from '@codaco/art';
import { ProtocolCard as ProtocolCardShell } from '@codaco/fresco-ui/ProtocolCard';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { PROTOCOL_NAME_MAX_LENGTH } from '~/config';
import countGraphemes from '~/utils/countGraphemes';
import { cx } from '~/utils/cva';

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
          it. The timeline card sidesteps this via a soft-wrapping textarea.

          Wrapping rules are not a bound, though: this heading measured 549px
          for a 400-character unbroken token inside a 720px viewport — and this
          cover is not only a print page. `ProtocolRouteGuard` renders
          `SummaryPage` as the WHOLE read-only view a tab gets when it loses the
          protocol lock, so an over-long legacy name would dominate the only
          screen that tab has. Clamp it to the three lines a name at the product
          cap already occupies (measured at the cover's 396px box), with the
          full value on `title`.

          Applied only ABOVE the cap, so every name Architect will now let a
          researcher write renders in full and unchanged — which is what keeps
          THIS clamp off `summary-print.png` (its fixture name is 14
          characters). That is no longer the whole story for that baseline:
          #1392 landed `wrap-break-word` on the shared `Heading`/`Paragraph`
          bases and dropped `shrink-0` from `Button`, all of which reach this
          cover. Both are no-ops for text that already fits and for buttons
          with room to sit in, so no movement is expected — but the guarantee
          now belongs to the branch's baseline check, not to this comment. */}
      <Heading
        level="h2"
        margin="none"
        dir="auto"
        title={name}
        className={cx(
          'wrap-break-word hyphens-auto',
          countGraphemes(name) > PROTOCOL_NAME_MAX_LENGTH && 'line-clamp-3',
        )}
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
