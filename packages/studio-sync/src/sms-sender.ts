import type { ClientRequest, IncomingMessage } from 'node:http';
import { request } from 'node:https';

import { z } from 'zod';

export type SmsFailureDisposition = 'retryable' | 'permanent' | 'uncertain';
export type SmsFailureReason = 'recipient-opt-out';

export class SmsDeliveryError extends Error {
  readonly disposition: SmsFailureDisposition;
  readonly reason: SmsFailureReason | undefined;

  constructor(outcome: SmsFailureDisposition, reason?: SmsFailureReason) {
    super(`SMS_DELIVERY_${outcome.toUpperCase()}`);
    this.name = 'SmsDeliveryError';
    this.disposition = outcome;
    this.reason = reason;
  }
}

export type SmsMessage = Readonly<{
  to: string;
  body: string;
  deliveryId: string;
}>;
export type SmsReceipt = Readonly<{
  status: 'accepted';
  providerMessageId: string;
}>;
export type SmsSender = {
  send(message: SmsMessage): Promise<SmsReceipt>;
  close(): void;
};

const configuration = z.strictObject({
  accountSid: z.string().regex(/^AC[0-9a-f]{32}$/),
  authToken: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[!-~]+$/),
  from: z.string().regex(/^\+[1-9]\d{6,14}$/),
  callbackBaseUrl: z.url({ protocol: /^https$/ }),
});
const message = z.strictObject({
  to: z.string().regex(/^\+[1-9]\d{6,14}$/),
  body: z
    .string()
    .min(1)
    .max(1600)
    .refine((value) => value.isWellFormed() && !value.includes('\0')),
  deliveryId: z.uuid(),
});
const acceptance = z.object({ sid: z.string().regex(/^SM[0-9a-f]{32}$/i) });
const rejection = z.object({
  code: z.union([z.literal(21610), z.literal('21610')]),
});
const RESPONSE_LIMIT = 16 * 1024;

function httpDisposition(status = 0): SmsFailureDisposition | undefined {
  if (status === 429) return 'retryable';
  if (status >= 500) return 'uncertain';
  if (status >= 400 && status < 500) return 'permanent';
  return undefined;
}

/** A single Twilio request. The provider SDK is intentionally avoided: it retries. */
export function createTwilioSmsSender(
  input: z.input<typeof configuration>,
): SmsSender {
  const parsed = configuration.safeParse(input);
  if (!parsed.success) throw new Error('TWILIO_CONFIGURATION_INVALID');
  const config = parsed.data;
  const active = new Set<() => void>();
  let closed = false;
  return {
    async send(value) {
      const parsedMessage = message.safeParse(value);
      if (!parsedMessage.success) throw new SmsDeliveryError('permanent');
      if (closed) throw new SmsDeliveryError('retryable');
      const callback = new URL(
        `/api/v1/message-status/twilio/${parsedMessage.data.deliveryId}`,
        config.callbackBaseUrl,
      );
      const body = new URLSearchParams({
        To: parsedMessage.data.to,
        From: config.from,
        Body: parsedMessage.data.body,
        StatusCallback: callback.toString(),
      }).toString();
      const result = Promise.withResolvers<SmsReceipt>();
      let outgoing: ClientRequest | undefined;
      let incoming: IncomingMessage | undefined;
      let connected = false;
      const cancel = () => {
        result.reject(
          new SmsDeliveryError(connected ? 'uncertain' : 'retryable'),
        );
        incoming?.destroy();
        outgoing?.destroy();
      };
      active.add(cancel);
      const timer = setTimeout(cancel, 30_000);
      timer.unref();
      try {
        outgoing = request(
          `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
          {
            method: 'POST',
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 8 * 1024,
            auth: `${config.accountSid}:${config.authToken}`,
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              'content-length': Buffer.byteLength(body),
            },
          },
          (response) => {
            incoming = response;
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > RESPONSE_LIMIT) return cancel();
              chunks.push(chunk);
            });
            response.once('error', cancel);
            response.once('aborted', cancel);
            response.once('end', () => {
              try {
                const rejected = httpDisposition(response.statusCode);
                if (rejected) {
                  if (rejected === 'permanent') {
                    let recipientOptOut = false;
                    try {
                      recipientOptOut = rejection.safeParse(
                        JSON.parse(Buffer.concat(chunks).toString('utf8')),
                      ).success;
                    } catch {
                      // A malformed rejection remains a proven HTTP 4xx.
                    }
                    if (recipientOptOut)
                      throw new SmsDeliveryError(
                        'permanent',
                        'recipient-opt-out',
                      );
                  }
                  throw new SmsDeliveryError(rejected);
                }
                const accepted = acceptance.safeParse(
                  JSON.parse(Buffer.concat(chunks).toString('utf8')),
                );
                if (
                  (response.statusCode !== 200 &&
                    response.statusCode !== 201) ||
                  !accepted.success
                )
                  throw new SmsDeliveryError('uncertain');
                result.resolve({
                  status: 'accepted',
                  providerMessageId: accepted.data.sid,
                });
              } catch (error) {
                result.reject(
                  error instanceof SmsDeliveryError
                    ? error
                    : new SmsDeliveryError('uncertain'),
                );
              }
            });
          },
        );
        outgoing.once('socket', (socket) =>
          socket.once('secureConnect', () => {
            connected = true;
          }),
        );
        outgoing.once('error', cancel);
        outgoing.end(body);
        return await result.promise;
      } finally {
        clearTimeout(timer);
        active.delete(cancel);
      }
    },
    close() {
      closed = true;
      for (const cancel of active) cancel();
    },
  };
}
