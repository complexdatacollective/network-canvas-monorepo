import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';
import Spinner from '@codaco/fresco-ui/Spinner';

const messages = defineMessages({
  opening: {
    id: 'studio.participant.opening',
    defaultMessage: 'Opening your interview…',
    description:
      'Screen-reader text while a participant’s interview link is being opened.',
  },
});

export default function ParticipantPending() {
  const intl = useAppIntl();
  return (
    <main
      id={DEFAULT_SKIP_TARGET_ID}
      className="flex min-h-dvh items-center justify-center"
      aria-busy
    >
      <Spinner />
      <output aria-live="polite" className="sr-only">
        {intl.formatMessage(messages.opening)}
      </output>
    </main>
  );
}
