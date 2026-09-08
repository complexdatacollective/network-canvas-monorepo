import { createAppIntl } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';

export type LocalizedMessage = Readonly<{
  descriptor: MessageDescriptor;
  values?: Readonly<Record<string, string | number>>;
}>;

export type MessageFailure = Readonly<{
  ok: false;
  // Preserve the existing English diagnostic contract for non-UI callers.
  message: string;
  localizedMessage: LocalizedMessage;
}>;

const diagnosticIntl = createAppIntl({ locale: 'en' });

export function messageFailure(
  descriptor: MessageDescriptor,
  values?: LocalizedMessage['values'],
): MessageFailure {
  return {
    ok: false,
    message: diagnosticIntl.formatMessage(descriptor, values),
    localizedMessage: { descriptor, values },
  };
}

export class LocalizedError extends Error {
  readonly localizedMessage: LocalizedMessage;
  constructor(
    descriptor: MessageDescriptor,
    values?: LocalizedMessage['values'],
  ) {
    super(diagnosticIntl.formatMessage(descriptor, values));
    this.localizedMessage = { descriptor, values };
  }
}
