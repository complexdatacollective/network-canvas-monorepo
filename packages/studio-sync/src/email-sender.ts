import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';

import nodemailer from 'nodemailer';
import parseAddresses from 'nodemailer/lib/addressparser/index.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { z } from 'zod';

export type EmailAddress = Readonly<{ name?: string; address: string }>;
export type EmailMessage = Readonly<{
  from: string | EmailAddress;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | EmailAddress;
  messageId?: string;
}>;
export type EmailReceipt = Readonly<{ status: 'accepted'; messageId: string }>;
export type EmailFailureDisposition = 'retryable' | 'permanent' | 'uncertain';

/** No provider response, address, credential, or submitted content escapes. */
export class EmailDeliveryError extends Error {
  readonly disposition: EmailFailureDisposition;

  constructor(disposition: EmailFailureDisposition) {
    super(`EMAIL_DELIVERY_${disposition.toUpperCase()}`);
    this.name = 'EmailDeliveryError';
    this.disposition = disposition;
  }
}

export type EmailSender = {
  send(message: EmailMessage): Promise<EmailReceipt>;
  /** Cancels this sender's in-flight sockets; their callers receive a typed outcome. */
  close(): void;
};

const header = z
  .string()
  .min(1)
  .max(2000)
  .refine((value) => value.isWellFormed() && !/[\r\n\0]/.test(value));
// SMTP addr-specs fit within the 256-octet path bound, including its brackets.
const mailbox = z.email().max(254);
const addressSchema = z.strictObject({
  name: header.optional(),
  address: mailbox,
});
const addressInput = z.union([header, addressSchema]);
const messageSchema = z.strictObject({
  from: addressInput,
  // An SMTP delivery has exactly one envelope recipient. Partial acceptance
  // cannot turn a retry into duplicate mail for an already accepted recipient.
  to: mailbox,
  subject: header,
  text: z
    .string()
    .max(256 * 1024)
    .refine((value) => value.isWellFormed() && !value.includes('\0')),
  replyTo: addressInput.optional(),
  messageId: z
    .string()
    .max(255)
    .regex(/^<[A-Za-z0-9._-]+@[A-Za-z0-9.-]+>$/)
    .optional(),
});

/** Normalize only the domain of an already validated addr-spec. */
export function normalizeMailbox(value: string): string {
  const boundary = value.lastIndexOf('@');
  // Nodemailer normalizes domains before reporting accepted recipients. Local
  // parts remain case sensitive, so compare the exact normalized envelope.
  return value.slice(0, boundary + 1) + value.slice(boundary + 1).toLowerCase();
}

function address(value: string | EmailAddress): EmailAddress {
  if (typeof value !== 'string') return addressSchema.parse(value);
  const parsed = parseAddresses(value, { flatten: true });
  const single = parsed[0];
  if (parsed.length !== 1 || !single) throw new EmailDeliveryError('permanent');
  return addressSchema.parse({
    address: single.address,
    ...(single.name ? { name: single.name } : {}),
  });
}

/** Both transports enforce the same single-recipient and header boundary. */
export function normalizeEmailMessage(value: EmailMessage) {
  try {
    const message = messageSchema.parse(value);
    return {
      ...message,
      from: address(message.from),
      to: normalizeMailbox(message.to),
      replyTo:
        message.replyTo === undefined ? undefined : address(message.replyTo),
      messageId: message.messageId ?? `<${randomUUID()}@networkcanvas.local>`,
    };
  } catch {
    throw new EmailDeliveryError('permanent');
  }
}

/** Reject transport toggles; a URL must describe only an SMTP authority. */
function connectionOptions(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    const port = url.port
      ? Number(url.port)
      : url.protocol === 'smtps:'
        ? 465
        : 587;
    const user = decodeURIComponent(url.username);
    const pass = decodeURIComponent(url.password);
    if (
      !['smtp:', 'smtps:'].includes(url.protocol) ||
      !host ||
      url.search ||
      url.hash ||
      (url.pathname && url.pathname !== '/') ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      (pass && !user) ||
      !user.isWellFormed() ||
      !pass.isWellFormed() ||
      /[\r\n\0]/.test(user + pass)
    )
      throw new Error();
    return {
      host,
      port,
      secure: url.protocol === 'smtps:',
      requireTLS: !local,
      ...(user ? { auth: { user, pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false as const,
      debug: false,
    };
  } catch {
    throw new Error('SMTP_CONFIGURATION_INVALID');
  }
}

function failure(error: unknown, connected: boolean): EmailDeliveryError {
  if (error instanceof EmailDeliveryError) return error;
  if (error !== null && typeof error === 'object') {
    const responseCode =
      'responseCode' in error ? error.responseCode : undefined;
    // An explicit negative SMTP reply proves rejection, including after DATA.
    if (typeof responseCode === 'number' && Number.isInteger(responseCode)) {
      if (responseCode >= 400 && responseCode < 500)
        return new EmailDeliveryError('retryable');
      if (responseCode >= 500 && responseCode < 600)
        return new EmailDeliveryError('permanent');
    }
    const code = 'code' in error ? error.code : undefined;
    if (
      ['EAUTH', 'EENVELOPE', 'EMESSAGE', 'ETLS', 'EREQUIRETLS'].includes(
        String(code),
      )
    )
      return new EmailDeliveryError('permanent');
  }
  // Nodemailer labels both greeting and post-DATA timeouts ETIMEDOUT/CONN.
  // A connected timeout or unexplained close is conservatively terminal.
  return new EmailDeliveryError(connected ? 'uncertain' : 'retryable');
}

export function createSmtpEmailSender({ url }: { url: string }): EmailSender {
  const options = connectionOptions(url);
  const active = new Set<() => void>();
  let closed = false;
  return {
    async send(value) {
      const message = normalizeEmailMessage(value);
      const { from, to, replyTo, messageId } = message;
      if (closed) throw new EmailDeliveryError('retryable');
      let socket: Socket | undefined;
      let connected = false;
      let canceled = false;
      const { promise: deadline, reject: rejectDeadline } =
        Promise.withResolvers<never>();
      const cancel = () => {
        canceled = true;
        socket?.destroy();
        rejectDeadline(
          new EmailDeliveryError(connected ? 'uncertain' : 'retryable'),
        );
      };
      active.add(cancel);
      const timer = setTimeout(cancel, 40_000);
      timer.unref();
      // The documented getSocket hook gives this send an owned socket. The
      // ordinary SMTPTransport.close() does not cancel an in-flight send.
      const transport = nodemailer.createTransport({
        ...options,
        getSocket(
          _connection: unknown,
          callback: (
            error: Error | null,
            options: false | { connection: Socket },
          ) => void,
        ) {
          if (canceled) {
            callback(new EmailDeliveryError('retryable'), false);
            return;
          }
          const connection = createConnection({
            host: options.host,
            port: options.port,
          });
          socket = connection;
          let returned = false;
          const connecting = setTimeout(() => {
            if (returned) return;
            returned = true;
            connection.destroy();
            callback(new EmailDeliveryError('retryable'), false);
          }, options.connectionTimeout);
          connecting.unref();
          connection.once('error', () => {
            clearTimeout(connecting);
            if (returned) return;
            returned = true;
            callback(new EmailDeliveryError('retryable'), false);
          });
          connection.once('close', () => clearTimeout(connecting));
          connection.once('connect', () => {
            clearTimeout(connecting);
            if (returned) return;
            returned = true;
            if (canceled) {
              connection.destroy();
              callback(new EmailDeliveryError('retryable'), false);
              return;
            }
            connected = true;
            callback(null, { connection });
          });
        },
      });
      try {
        const receipt: SMTPTransport.SentMessageInfo = await Promise.race([
          transport.sendMail({
            from: { ...from, name: from.name ?? '' },
            to,
            ...(replyTo
              ? { replyTo: { ...replyTo, name: replyTo.name ?? '' } }
              : {}),
            subject: message.subject,
            text: message.text,
            messageId,
            envelope: { from: from.address, to: [to] },
            disableFileAccess: true,
            disableUrlAccess: true,
          }),
          deadline,
        ]);
        const recipient = receipt.accepted[0];
        const acceptedAddress =
          typeof recipient === 'string' ? recipient : recipient?.address;
        if (
          receipt.accepted.length !== 1 ||
          acceptedAddress !== to ||
          receipt.rejected.length !== 0
        )
          throw new EmailDeliveryError('uncertain');
        return { status: 'accepted', messageId };
      } catch (error) {
        throw failure(error, connected);
      } finally {
        clearTimeout(timer);
        active.delete(cancel);
        socket?.destroy();
        transport.close();
      }
    },
    close() {
      closed = true;
      for (const cancel of active) cancel();
    },
  };
}
