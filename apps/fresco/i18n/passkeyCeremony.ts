import {
  createMessageError,
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';

const messages = defineMessages({
  signInDidNotComplete: {
    id: 'fresco.passkeyCeremony.signInDidNotComplete',
    defaultMessage:
      'Passkey sign-in did not complete. If you cancelled, try again. If your passkey cannot confirm who you are with a PIN, fingerprint, or face, use a different passkey or ask another administrator to reset your authentication.',
    description:
      'Error on the sign-in page when the browser closed the passkey prompt without a passkey being used: cancelled, timed out, or the passkey could not verify the person. Suggests the two ways forward.',
  },
  reauthDidNotComplete: {
    id: 'fresco.passkeyCeremony.reauthDidNotComplete',
    defaultMessage:
      'Passkey check did not complete. If you cancelled, try again. If your passkey cannot confirm who you are with a PIN, fingerprint, or face, add a passkey that can and use that one.',
    description:
      "Error in the Switch to Password Authentication dialog in Settings when the browser closed the passkey prompt used to confirm the researcher's identity: cancelled, timed out, or could not verify the person.",
  },
  registrationDidNotComplete: {
    id: 'fresco.passkeyCeremony.registrationDidNotComplete',
    defaultMessage:
      'Passkey creation did not complete. If you cancelled, try again. If your device or security key cannot confirm who you are with a PIN, fingerprint, or face, choose a different one.',
    description:
      'Error shown when creating a new passkey, in the setup wizard or in Settings, and the browser closed the creation prompt without a passkey being made: cancelled, timed out, or the device could not verify the person.',
  },
  registrationUnsupported: {
    id: 'fresco.passkeyCeremony.registrationUnsupported',
    defaultMessage:
      'This device or security key cannot create a Fresco passkey. Fresco needs a passkey that is stored on the device and confirms who you are with a PIN, fingerprint, or face. Choose a different one.',
    description:
      'Error shown when creating a new passkey, in the setup wizard or in Settings, and the chosen device or security key cannot make the kind of passkey Fresco requires (stored on the device, verified by PIN, fingerprint or face).',
  },
});

type PasskeyCeremony = 'signIn' | 'reauth' | 'registration';

const didNotComplete: Record<PasskeyCeremony, MessageDescriptor> = {
  signIn: messages.signInDidNotComplete,
  reauth: messages.reauthDidNotComplete,
  registration: messages.registrationDidNotComplete,
};

/**
 * Researcher-facing guidance for a failure thrown by `startAuthentication` or
 * `startRegistration`.
 *
 * Fresco asks for a discoverable passkey with required user verification, so
 * a browser may end the ceremony before any response reaches the server and
 * the server's own explanation never runs. The browser reports that as
 * `NotAllowedError` whether the researcher cancelled, the prompt timed out, or
 * no authenticator could verify the user, so that message names all three
 * and the way back in. `ConstraintError` is the one failure a browser may
 * attribute: the chosen authenticator cannot create the passkey Fresco asked
 * for. Anything else — a failed action call, an unexpected DOMException —
 * keeps the caller's own message. The browser library rethrows each
 * DOMException as an `Error` subclass that keeps the DOMException's name.
 */
export function describePasskeyCeremonyError(
  error: unknown,
  ceremony: PasskeyCeremony,
  fallback: MessageDescriptor,
): string {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') {
      return createMessageError(didNotComplete[ceremony]);
    }
    if (error.name === 'ConstraintError' && ceremony === 'registration') {
      return createMessageError(messages.registrationUnsupported);
    }
  }
  return createMessageError(fallback);
}
