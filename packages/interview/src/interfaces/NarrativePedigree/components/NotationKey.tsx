import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import type { NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';
import { messages } from '../messages';
import { Sticker } from './Sticker';

type NotationKeyEntry = {
  status: Status;
  label: MessageDescriptor;
  // At-risk (probabilistic) markers are only listed when the stage option is on.
  atRisk?: boolean;
};

// Participant-facing wording for each glyph. Kept as whole strings (never
// concatenated) so they read naturally and stay translatable. These describe
// what each marker means in plain language rather than reusing the clinical
// getStatusLabel verbatim. Each maps to a distinct Bennett-2022 glyph drawn by
// the Sticker: affected = filled, will-develop (obligate/presymptomatic) =
// vertical line, carrier = horizontal line-fill; the at-risk variants reuse the
// certain glyph plus a "?".
const NOTATION_KEY_ENTRIES: NotationKeyEntry[] = [
  { status: 'affected', label: messages.hasCondition },
  { status: 'obligateAffected', label: messages.willDevelop },
  { status: 'obligateCarrier', label: messages.carries },
  {
    status: 'atRiskAffected',
    label: messages.mayDevelop,
    atRisk: true,
  },
  { status: 'atRiskCarrier', label: messages.mayCarry, atRisk: true },
  { status: 'unknown', label: messages.notKnown },
];

type NotationKeyProps = {
  // Colour of the glyph symbols. When a single condition is shown this is that
  // condition's colour so the key matches the pedigree; otherwise a neutral
  // vivid node colour.
  glyphColour: string;
  shape: NodeShape;
  // Whether the at-risk (probabilistic) markers are drawn on the pedigree; when
  // false the two at-risk rows are omitted from the key.
  showAtRiskStatuses: boolean;
};

/**
 * The list of status-notation glyphs and their plain-language meanings. Rendered
 * both in the on-screen condition key and in the printable snapshot document, so
 * the two always describe the same symbols. Text colour is inherited so it reads
 * on the dark key panel and in the light snapshot alike.
 */
export function NotationKey({
  glyphColour,
  shape,
  showAtRiskStatuses,
}: NotationKeyProps) {
  const entries = showAtRiskStatuses
    ? NOTATION_KEY_ENTRIES
    : NOTATION_KEY_ENTRIES.filter((entry) => !entry.atRisk);

  return (
    <>
      {entries.map((entry) => (
        <div key={entry.status} className="flex items-center gap-4 text-base">
          <span aria-hidden className="flex shrink-0">
            <Sticker status={entry.status} color={glyphColour} shape={shape} />
          </span>
          <AppMessage message={entry.label} />
        </div>
      ))}
    </>
  );
}
