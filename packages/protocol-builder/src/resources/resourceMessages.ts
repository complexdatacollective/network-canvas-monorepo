import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Every researcher-facing refusal this package's own resource code produces.
 *
 * One home rather than one per module, because these messages cross a
 * string-only contract (`ResourceGatewayFailure.message`): they are encoded
 * with `createMessageError` where they are produced and decoded with
 * `formatMessageError(text, intl) ?? text` where they are rendered. The
 * `?? text` is what keeps a host's own plain-string failure working unchanged
 * — the host writes the rest of what a researcher reads here, in its own
 * language, and nothing in this package translates it.
 */
export const resourceFailureMessages = defineMessages({
  unreachable: {
    id: 'protocolBuilder.resourceFailure.unreachable',
    defaultMessage: 'The resource could not be reached. Try again in a moment.',
    description:
      'Shown to a researcher when the host storing protocol resources (images, audio, rosters, API keys) threw instead of answering. Deliberately says nothing about the host.',
  },
  resourceLeaving: {
    id: 'protocolBuilder.resourceFailure.resourceLeaving',
    defaultMessage:
      'That resource is being discarded, so it cannot be used here. Choose a different one.',
    description:
      'Refusal shown when a researcher picks a resource another field is in the middle of discarding.',
  },
  resourceDiscarded: {
    id: 'protocolBuilder.resourceFailure.resourceDiscarded',
    defaultMessage:
      'That resource is no longer available: it was discarded while this list was open. Close and reopen the browser to see what there is.',
    description:
      'Refusal shown when a researcher picks a resource from a list read before that resource was discarded. "The browser" is this app’s resource-picking dialog, not the web browser.',
  },
});
