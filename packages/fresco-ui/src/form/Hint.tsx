import { type ReactNode } from 'react';

import { RenderMarkdown } from '../RenderMarkdown';

/**
 * A hint written as a plain string is researcher- or author-supplied markdown;
 * anything else is already a rendered tree and is shown as it is.
 *
 * Decided per part rather than over the two together, because a field can
 * carry both at once, and markdown run across the pair would read the end of
 * the hint and the start of the summary as one paragraph. Never run over a
 * FRAGMENT of a part: a hint formatted from a message with a tag in it — "see
 * our <link>documentation</link>" — arrives as a list of strings and elements,
 * and markdown rendering each string on its own trims the space in front of
 * the link, so the sentence reaches the researcher with two words run
 * together.
 */
const hintPart = (part: ReactNode): ReactNode =>
  typeof part === 'string' ? <RenderMarkdown>{part}</RenderMarkdown> : part;

export default function Hint({
  id,
  hint,
  validationSummary,
}: {
  id: string;
  hint?: ReactNode;
  validationSummary?: ReactNode;
}) {
  return (
    <div id={id} className="text-sm text-current/70">
      {hintPart(hint)}
      {hintPart(validationSummary)}
    </div>
  );
}
