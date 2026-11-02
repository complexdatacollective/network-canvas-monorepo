import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { useSettledValue } from './useSettledValue.ts';

const messages = defineMessages({
  heldByAnother: {
    id: 'studio.editor.lockHeldByAnother',
    defaultMessage: '{name} is read-only, because somebody else is editing it.',
    description:
      'Screen-reader announcement when an interview screen the researcher opened turns out to be held by another researcher, so it can be read but not changed; {name} is the screen name.',
  },
  lost: {
    id: 'studio.editor.lockLost',
    defaultMessage: 'You can no longer edit {name}. It is now read-only.',
    description:
      'Screen-reader announcement when the researcher loses the right to edit the interview screen they were editing; {name} is the screen name.',
  },
  regained: {
    id: 'studio.editor.lockRegained',
    defaultMessage: 'You can edit {name} again.',
    description:
      'Screen-reader announcement when the researcher can change an interview screen again after it was read-only; {name} is the screen name.',
  },
});

/**
 * Says aloud when the researcher's ability to edit the open screen changes.
 *
 * Losing the editing lock mid-edit turns every field read-only and discards
 * the draft; a visible banner alone leaves a screen-reader user typing into
 * fields that no longer take their changes. This is the spoken half.
 *
 * What is announced is a change of what the researcher can do, once it has
 * settled: gaining or losing the lock, or finding the screen already held by
 * somebody else. Opening a screen that simply becomes editable says nothing,
 * and neither does the interval while the lock is still being asked for. The
 * region is always mounted and starts empty, because one that appears with
 * its text already inside is often not announced.
 *
 * Mounted once per screen (keyed by the caller), so what was true of the
 * previous screen is never mistaken for a change in this one.
 */
export default function LockAnnouncer({
  name,
  access,
}: {
  /** What the open screen is called on screen. */
  name: string;
  /** `undefined` while the screen's editor has not reported yet. */
  access: 'pending' | 'editing' | 'readOnly' | undefined;
}) {
  const intl = useAppIntl();
  const settled = useSettledValue(access);
  const known = useRef<'editing' | 'readOnly' | undefined>(undefined);
  // Whether this screen has been editable at any point, whether or not that
  // lasted long enough to settle: it is what tells a lock that was taken away
  // from a screen that was somebody else's when it opened.
  const wasEditing = useRef(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (access === 'editing') wasEditing.current = true;
  }, [access]);

  useEffect(() => {
    if (settled === undefined || settled === 'pending') return;
    const previous = known.current;
    known.current = settled;
    if (previous === settled) return;
    if (settled === 'readOnly') {
      setMessage(
        intl.formatMessage(
          wasEditing.current ? messages.lost : messages.heldByAnother,
          { name },
        ),
      );
    } else if (previous === 'readOnly') {
      setMessage(intl.formatMessage(messages.regained, { name }));
    }
  }, [intl, name, settled]);

  return (
    <output aria-live="polite" className="sr-only">
      {message}
    </output>
  );
}
