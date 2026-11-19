import { z } from 'zod';

import type {
  ReviewErrorCode,
  ReviewProvider,
} from '@codaco/protocol-review-worker/contract';

/**
 * A review written by a model endpoint of the researcher's own (Ollama, LM
 * Studio, an institution's server, a hosted provider) rather than by one of
 * the providers the Network Canvas service calls. Architect sends the review
 * to that endpoint itself, from the browser: the protocol, the study details
 * and the API key never pass through the Network Canvas service.
 */

/** The choice of the researcher's own model, beside the service's providers. */
export const OWN_MODEL = 'own';

/** Who writes a review: one of the service's providers, or the researcher's own model. */
export type ReviewWriter = ReviewProvider | typeof OWN_MODEL;

export type OwnModelSettings = {
  /** The endpoint's base address, as the researcher typed it. */
  address: string;
  /** The model's name, as the endpoint knows it. */
  model: string;
  /** Sent as a bearer token; empty when the endpoint needs none. */
  apiKey: string;
};

export const OWN_MODEL_LIMITS = { address: 500, model: 200, apiKey: 500 };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * The address as a URL Architect may call, or null. Any `https` address is
 * allowed; plain `http` only for this computer, which is what the app's
 * content security policy and the browser's own rules permit.
 */
const endpointUrl = (address: string): URL | null => {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '') return null;
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url;
  return null;
};

export const isOwnModelAddress = (address: string): boolean =>
  endpointUrl(address) !== null;

const CHAT_COMPLETIONS = '/chat/completions';

/**
 * Where the endpoint's OpenAI-compatible chat API answers: the address with
 * `/chat/completions` after it, unless it already ends so. Null for an
 * address Architect may not call.
 */
export const chatCompletionsUrl = (address: string): string | null => {
  const url = endpointUrl(address);
  if (url === null) return null;
  const path = url.pathname.replace(/\/+$/u, '');
  url.pathname = path.endsWith(CHAT_COMPLETIONS)
    ? path
    : `${path}${CHAT_COMPLETIONS}`;
  url.hash = '';
  return url.toString();
};

const OwnModelSettingsSchema = z.object({
  address: z
    .string()
    .trim()
    .max(OWN_MODEL_LIMITS.address)
    .refine((address) => isOwnModelAddress(address)),
  model: z.string().trim().min(1).max(OWN_MODEL_LIMITS.model),
  apiKey: z.string().trim().max(OWN_MODEL_LIMITS.apiKey).catch(''),
});

/** Settings a review can be sent with, trimmed; null when they are not. */
export const completeOwnModelSettings = (
  value: unknown,
): OwnModelSettings | null => {
  const parsed = OwnModelSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * Why the researcher's own model did not produce a review, as a fixed code
 * Architect turns into words.
 *
 * - `unreachable`: no answer at all. The address is wrong, the server is not
 *   running, or it does not accept requests from a web page (CORS).
 * - `refused`: the endpoint refused the API key (401 or 403).
 * - `not_found`: the endpoint has no chat API at this address, or no model of
 *   this name (404).
 * - `too_long`: the instructions and the protocol are more than the model
 *   can read at once.
 * - `unreadable_answer`: the model answered, but not with findings in the
 *   form Architect needs, or its answer was cut short.
 * - `endpoint_error`: any other error from the endpoint, or no answer within
 *   the time allowed.
 */
export const OWN_MODEL_ERROR_CODES = [
  'unreachable',
  'refused',
  'not_found',
  'too_long',
  'unreadable_answer',
  'endpoint_error',
] as const;

export type OwnModelErrorCode = (typeof OWN_MODEL_ERROR_CODES)[number];

/** Why a review failed, whoever was asked to write it. */
export type ReviewFailureCode = ReviewErrorCode | OwnModelErrorCode;

export const isOwnModelErrorCode = (
  code: ReviewFailureCode,
): code is OwnModelErrorCode =>
  OWN_MODEL_ERROR_CODES.some((candidate) => candidate === code);
