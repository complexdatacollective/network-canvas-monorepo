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
      });

      if (!response.ok) throw new Error('Locale change failed');
    });

    previous = Promise.allSettled([write]);
    return write;
  };
}
