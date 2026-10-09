import type { ProtocolLocaleChangeHandler } from '@codaco/interview/contract';

/**
 * Build the handler that persists an interview's locale fields through the
 * locale route. Each write waits for the previous one to settle, so a later
 * change can never land before an earlier one and be overwritten by it.
 */
export function createProtocolLocaleChangeHandler(): ProtocolLocaleChangeHandler {
  let previous: Promise<unknown> = Promise.resolve();

  return (interviewId, { locale, localePreference }) => {
    const write = previous.then(async () => {
      const response = await fetch(`/interview/${interviewId}/locale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, localePreference }),
        // A language is often chosen just before the participant leaves, and
        // an ordinary request dies with the page. Two language tags sit far
        // below the 64KB the browser allows keepalive bodies, so unlike the
        // answer sync this can always ask for it.
        keepalive: true,
      });

      if (!response.ok) throw new Error('Locale change failed');
    });

    previous = Promise.allSettled([write]);
    return write;
  };
}
