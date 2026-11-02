import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { useSettledValue } from './useSettledValue.ts';

const messages = defineMessages({
  problemCount: {
    id: 'studio.editor.validationCountAnnouncement',
    defaultMessage:
      '{count, plural, =0 {No validation problems.} one {# validation problem.} other {# validation problems.}}',
    description:
      'Screen-reader announcement of how many validation problems the protocol now has, said when that number changes.',
  },
});

/**
 * Says how many validation problems the protocol has whenever that number
 * changes and stays changed.
 *
 * Always mounted, and rendered empty: a live region that appears with its
 * text already inside is often not announced at all, so the text is what
 * changes here, not the element. The count the researcher finds when they open
 * the editor is not announced — the button beside the title already says it —
 * and neither is a state with no count to give: the protocol still being
 * checked, or part of it unreadable.
 *
 * `problemCount` is `undefined` while there is no answer.
 */
export default function ValidationAnnouncer({
  problemCount,
}: {
  problemCount: number | undefined;
}) {
  const intl = useAppIntl();
  const settled = useSettledValue(problemCount);
  const announced = useRef<number | undefined>(undefined);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (settled === undefined) return;
    const previous = announced.current;
    announced.current = settled;
    if (previous === undefined || previous === settled) return;
    setMessage(intl.formatMessage(messages.problemCount, { count: settled }));
  }, [intl, settled]);

  return (
    <output aria-live="polite" className="sr-only">
      {message}
    </output>
  );
}
