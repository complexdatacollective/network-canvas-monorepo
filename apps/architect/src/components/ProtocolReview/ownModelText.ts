import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type { OwnModelErrorCode } from '~/protocolReview/ownModel';

/**
 * Why the researcher's own model did not answer, in words: shown by the
 * connection test in the dialog that starts a review, and by the review
 * panel when a review it was asked for failed.
 */

const failureMessages = defineMessages({
  unreachableTitle: {
    id: 'architect.protocolReview.ownModel.failure.unreachableTitle',
    defaultMessage: 'Your endpoint could not be reached',
    description:
      'Title of the notice shown when Architect could not connect to the model endpoint the researcher set up for automated protocol review. An endpoint is the web address a model server answers at.',
  },
  unreachableBody: {
    id: 'architect.protocolReview.ownModel.failure.unreachableBody',
    defaultMessage:
      'Check that the address is right, that the model server is running, and that it accepts requests from web pages: its CORS setting must allow {origin}.',
    description:
      'Text of the notice shown when Architect could not connect to the researcher’s own model endpoint. "CORS" is a technical term for the setting that lets a web page call a server, and is not translated. {origin} is the web address of Architect itself, such as "https://architect.networkcanvas.com".',
  },
  refusedTitle: {
    id: 'architect.protocolReview.ownModel.failure.refusedTitle',
    defaultMessage: 'Your endpoint refused the API key',
    description:
      'Title of the notice shown when the researcher’s own model endpoint refused the API key they entered. An API key is a credential.',
  },
  refusedBody: {
    id: 'architect.protocolReview.ownModel.failure.refusedBody',
    defaultMessage:
      'Check the API key, and that it is allowed to use this model.',
    description:
      'Text of the notice shown when the researcher’s own model endpoint refused the API key they entered.',
  },
  notFoundTitle: {
    id: 'architect.protocolReview.ownModel.failure.notFoundTitle',
    defaultMessage: 'The address or the model was not found',
    description:
      'Title of the notice shown when the researcher’s own model endpoint answered that the address or the model name does not exist.',
  },
  notFoundBody: {
    id: 'architect.protocolReview.ownModel.failure.notFoundBody',
    defaultMessage:
      'Check the model name, and that the address is the base address of an OpenAI-compatible API. It often ends in /v1.',
    description:
      'Text of the notice shown when the researcher’s own model endpoint answered that the address or the model name does not exist. "OpenAI-compatible API" is a technical term; "OpenAI" is a company name and is not translated. "/v1" is part of a web address and is not translated.',
  },
  tooLongTitle: {
    id: 'architect.protocolReview.ownModel.failure.tooLongTitle',
    defaultMessage: 'This protocol is too long for your model',
    description:
      'Title of the notice shown when the review instructions and the protocol together are more text than the researcher’s own model can read at once.',
  },
  tooLongBody: {
    id: 'architect.protocolReview.ownModel.failure.tooLongBody',
    defaultMessage:
      'The review instructions and your protocol together are more than the model can read at once. Use a model with a larger context window, or raise the context length your model server allows.',
    description:
      'Text of the notice shown when the protocol is too long for the researcher’s own model. A "context window" (or "context length") is the amount of text a language model can read at once.',
  },
  unreadableTitle: {
    id: 'architect.protocolReview.ownModel.failure.unreadableTitle',
    defaultMessage: 'Your model’s answer could not be used',
    description:
      'Title of the notice shown when the researcher’s own model answered, but not with a review in the form Architect needs.',
  },
  unreadableBody: {
    id: 'architect.protocolReview.ownModel.failure.unreadableBody',
    defaultMessage:
      'The model did not answer in the form Architect needs, or its answer was cut short. A more capable model, or a larger context window, may do better.',
    description:
      'Text of the notice shown when the researcher’s own model’s answer could not be read as a review. "Architect" is the product name and is not translated. A "context window" is the amount of text a language model can read at once.',
  },
  endpointErrorTitle: {
    id: 'architect.protocolReview.ownModel.failure.endpointErrorTitle',
    defaultMessage: 'Your endpoint returned an error or took too long',
    description:
      'Title of the notice shown when the researcher’s own model endpoint answered with an error, or did not answer in time.',
  },
  endpointErrorBody: {
    id: 'architect.protocolReview.ownModel.failure.endpointErrorBody',
    defaultMessage: 'The model server’s own logs will say why.',
    description:
      'Text of the notice shown when the researcher’s own model endpoint answered with an error, or did not answer in time. The model server is the program that runs the model behind the endpoint; its logs are its record of what happened.',
  },
});

const failures: Record<
  OwnModelErrorCode,
  { title: MessageDescriptor; body: MessageDescriptor }
> = {
  unreachable: {
    title: failureMessages.unreachableTitle,
    body: failureMessages.unreachableBody,
  },
  refused: {
    title: failureMessages.refusedTitle,
    body: failureMessages.refusedBody,
  },
  not_found: {
    title: failureMessages.notFoundTitle,
    body: failureMessages.notFoundBody,
  },
  too_long: {
    title: failureMessages.tooLongTitle,
    body: failureMessages.tooLongBody,
  },
  unreadable_answer: {
    title: failureMessages.unreadableTitle,
    body: failureMessages.unreadableBody,
  },
  endpoint_error: {
    title: failureMessages.endpointErrorTitle,
    body: failureMessages.endpointErrorBody,
  },
};

/** Why the researcher's own model did not answer, as a title and a sentence or two. */
export const formatOwnModelFailure = (
  intl: IntlShape,
  code: OwnModelErrorCode,
): { title: string; body: string } => ({
  title: intl.formatMessage(failures[code].title),
  body: intl.formatMessage(failures[code].body, {
    origin: typeof window === 'undefined' ? '' : window.location.origin,
  }),
});
