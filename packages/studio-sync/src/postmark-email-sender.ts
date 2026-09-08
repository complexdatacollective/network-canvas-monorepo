import type { ClientRequest, IncomingMessage } from 'node:http';
import { request } from 'node:https';

import { z } from 'zod';

import {
  EmailDeliveryError,
  type EmailAddress,
  type EmailFailureDisposition,
  type EmailReceipt,
  type EmailSender,
  normalizeEmailMessage,
  normalizeMailbox,
  validateEmailAddress,
} from './email-sender.ts';

export const postmarkConfiguration = z.strictObject({
  serverToken: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[!-~]+$/),
  messageStream: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
    .optional(),
});
const acceptance = z.object({
  ErrorCode: z.literal(0),
  MessageID: z.uuid(),
  To: z.email().max(254),
});
const providerError = z.object({ ErrorCode: z.number().int().positive() });
const RESPONSE_LIMIT = 16 * 1024;

function rejectedHttpDisposition(
  status = 0,
): EmailFailureDisposition | undefined {
  if (status >= 400 && status < 500 && status !== 408)
    return status === 429 ? 'retryable' : 'permanent';
}

function formatAddress(value: EmailAddress): string {
  return value.name
    ? `"${value.name.replace(/["\\]/g, '\\$&')}" <${value.address}>`
    : value.address;
}

/** Validate the provider's formatted From limit before accepting work. */
export function validatePostmarkFrom(
  value: string | EmailAddress,
): EmailAddress {
  const from = validateEmailAddress(value);
  if (formatAddress(from).length > 255)
    throw new EmailDeliveryError('permanent');
  return from;
}

function receipt(
  response: IncomingMessage,
  body: string,
  to: string,
  messageId: string,
): EmailReceipt {
  let data: unknown;
  if (
    response.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ===
    'application/json'
  ) {
    try {
      data = JSON.parse(body);
    } catch {
      // A malformed response is never proof that a send was not accepted.
    }
  }
  const accepted = acceptance.safeParse(data);
  if (
    response.statusCode === 200 &&
    accepted.success &&
    normalizeMailbox(accepted.data.To) === to
  ) {
    // The API's MessageID is Postmark's own tracking UUID, not the RFC header.
    return { status: 'accepted', messageId };
  }
  if (
    data !== null &&
    typeof data === 'object' &&
    (('ErrorCode' in data && data.ErrorCode === 0) ||
      ('MessageID' in data && data.MessageID))
  ) {
    // Contradictory HTTP/body outcomes must not trigger a duplicate send.
    throw new EmailDeliveryError('uncertain');
  }
  const status = response.statusCode ?? 0;
  const rejectedStatus = rejectedHttpDisposition(status);
  if (rejectedStatus) throw new EmailDeliveryError(rejectedStatus);
  const rejected = providerError.safeParse(data);
  if (status === 503 && rejected.success && rejected.data.ErrorCode === 100) {
    // Postmark documents code 100 as explicitly offline for maintenance.
    throw new EmailDeliveryError('retryable');
  }
  // A generic proxy 5xx, Postmark 500/101, 408, or unproven 2xx is ambiguous.
  throw new EmailDeliveryError('uncertain');
}

/** One owned HTTPS request, no redirects, pooling, SDK logging, or retries. */
export function createPostmarkEmailSender(options: {
  serverToken: string;
  messageStream?: string;
}): EmailSender {
  const parsed = postmarkConfiguration.safeParse(options);
  if (!parsed.success) throw new Error('POSTMARK_CONFIGURATION_INVALID');
  const { serverToken, messageStream = 'outbound' } = parsed.data;
  const active = new Set<() => void>();
  let closed = false;
  return {
    async send(value) {
      const message = normalizeEmailMessage(value);
      const from = formatAddress(validatePostmarkFrom(message.from));
      const replyTo = message.replyTo && formatAddress(message.replyTo);
      if (!message.text) {
        throw new EmailDeliveryError('permanent');
      }
      if (closed) throw new EmailDeliveryError('retryable');
      const body = JSON.stringify({
        From: from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        ...(replyTo ? { ReplyTo: replyTo } : {}),
        Headers: [{ Name: 'Message-ID', Value: message.messageId }],
        MessageStream: messageStream,
        TrackOpens: false,
        TrackLinks: 'None',
      });
      const result = Promise.withResolvers<EmailReceipt>();
      let outgoing: ClientRequest | undefined;
      let incoming: IncomingMessage | undefined;
      let connected = false;
      // A received 4xx rejection remains definitive even if its body is lost.
      // Without that evidence, TLS completion determines whether a send is ambiguous.
      const interruptedDisposition = (): EmailFailureDisposition =>
        rejectedHttpDisposition(incoming?.statusCode) ??
        (connected ? 'uncertain' : 'retryable');
      const cancel = () => {
        result.reject(new EmailDeliveryError(interruptedDisposition()));
        incoming?.destroy();
        outgoing?.destroy();
      };
      active.add(cancel);
      const deadline = setTimeout(cancel, 30_000);
      const connecting = setTimeout(cancel, 10_000);
      deadline.unref();
      connecting.unref();
      try {
        outgoing = request(
          'https://api.postmarkapp.com/email',
          {
            method: 'POST',
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 8 * 1024,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'X-Postmark-Server-Token': serverToken,
            },
          },
          (response) => {
            incoming = response;
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > RESPONSE_LIMIT) {
                cancel();
                return;
              }
              chunks.push(chunk);
            });
            response.once('error', cancel);
            response.once('aborted', cancel);
            response.once('end', () => {
              try {
                result.resolve(
                  receipt(
                    response,
                    Buffer.concat(chunks).toString('utf8'),
                    message.to,
                    message.messageId,
                  ),
                );
              } catch (error) {
                // Only our closed diagnostic vocabulary crosses the boundary.
                result.reject(
                  error instanceof EmailDeliveryError
                    ? error
                    : new EmailDeliveryError('uncertain'),
                );
              }
            });
          },
        );
        outgoing.once('socket', (socket) => {
          // HTTPS cannot transmit the email until TLS completes. A reset or
          // timeout during negotiation is therefore definitely unsent.
          socket.once('secureConnect', () => {
            connected = true;
            clearTimeout(connecting);
          });
        });
        outgoing.once('error', cancel);
        outgoing.end(body);
        return await result.promise;
      } catch (error) {
        throw error instanceof EmailDeliveryError
          ? error
          : new EmailDeliveryError(interruptedDisposition());
      } finally {
        clearTimeout(connecting);
        clearTimeout(deadline);
        active.delete(cancel);
        incoming?.destroy();
        outgoing?.destroy();
      }
    },
    close() {
      closed = true;
      for (const cancel of active) cancel();
    },
  };
}
