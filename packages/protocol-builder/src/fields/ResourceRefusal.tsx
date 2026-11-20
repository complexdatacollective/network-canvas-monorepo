import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

/**
 * Why a resource was refused (`takeChosenResource`), announced as it
 * appears. `message` is held encoded and decoded here, so one on screen is
 * read in the language now chosen; one that is not a message error is shown
 * as it came.
 */
export function ResourceRefusal({ message }: Readonly<{ message: string }>) {
  const intl = useAppIntl();
  return (
    <div role="alert" className="text-destructive-ink text-sm">
      {formatMessageError(message, intl) ?? message}
    </div>
  );
}
