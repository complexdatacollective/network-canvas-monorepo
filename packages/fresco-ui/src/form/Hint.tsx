import { type ReactNode } from 'react';

import {
  isPresentationalText,
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../PresentationalText';
import { RenderMarkdown } from '../RenderMarkdown';

/**
 * A hint written as a plain string is researcher- or author-supplied markdown,
 * as is the text of a `PresentationalText` object, which is shown inside an
 * inline element carrying its `lang`/`dir` so it keeps flowing into the
 * validation summary. Anything else is already a rendered tree and is shown
 * as it is.
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
const hintPart = (part: ReactNode | PresentationalText): ReactNode => {
  if (typeof part === 'string') return <RenderMarkdown>{part}</RenderMarkdown>;
  if (isPresentationalText(part)) {
    return (
      <RenderMarkdown render={<span {...presentationalTextProps(part)} />}>
        {presentationalTextValue(part)}
      </RenderMarkdown>
    );
  }
  return part;
};

export default function Hint({
  id,
  hint,
  validationSummary,
  children,
}: {
  id: string;
  hint?: ReactNode | PresentationalText;
  validationSummary?: ReactNode;
  /** What a consumer outside this repo passes; `hint` is the primary API. */
  children?: ReactNode;
}) {
  return (
    <div id={id} className="text-sm text-current/70">
      {hintPart(hint ?? children)}
      {hintPart(validationSummary)}
    </div>
  );
}
