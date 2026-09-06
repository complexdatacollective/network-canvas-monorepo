import { setImmediate } from 'node:timers/promises';
import tls from 'node:tls';

import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSmtpEmailSender,
  EmailDeliveryError,
  type EmailMessage,
  type EmailSender,
} from '../email-sender.ts';
import { smtpFixture, type SmtpBehavior } from './smtp-fixture.ts';

const message: EmailMessage = {
  from: 'Network Canvas <sender@example.test>',
  to: 'private-recipient@example.test',
  subject: 'Test notification',
  text: 'Private body canary',
  messageId: '<fixture-message@networkcanvas.local>',
};

describe('bounded SMTP EmailSender using the real Nodemailer transport', () => {
  const peers: Awaited<ReturnType<typeof smtpFixture>>[] = [];
  const senders: EmailSender[] = [];
  const setup = async (behavior?: SmtpBehavior, authenticated = false) => {
    const peer = await smtpFixture(behavior);
    peers.push(peer);
    const sender = createSmtpEmailSender({
      url: authenticated
        ? peer.url.replace('smtp://', 'smtp://synthetic:fixture@')
        : peer.url,
    });
    senders.push(sender);
    return { peer, sender };
  };
  afterEach(async () => {
    for (const sender of senders.splice(0)) sender.close();
    for (const peer of peers.splice(0)) await peer.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delivers one recipient with exact content and returns the accepted message ID', async () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    const { sender, peer } = await setup();
    expect(
      await sender.send({
        ...message,
        replyTo: { name: 'Study team', address: 'reply@example.test' },
      }),
    ).toEqual({ status: 'accepted', messageId: message.messageId });
    expect(peer.messages).toHaveLength(1);
    expect(
      peer.commands.filter((command) => command.startsWith('RCPT TO')),
    ).toEqual(['RCPT TO:<private-recipient@example.test>']);
    expect(peer.messages[0]).toContain(
      'From: Network Canvas <sender@example.test>',
    );
    expect(peer.messages[0]).toContain(
      'Reply-To: Study team <reply@example.test>',
    );
    expect(peer.messages[0]).toContain(
      'Message-ID: <fixture-message@networkcanvas.local>',
    );
    expect(peer.messages[0]).toContain('Private body canary');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      host: '127.0.0.1',
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
      debug: false,
    });
    expect(spy.mock.calls[0]?.[0]).not.toHaveProperty('url');
  });

  it.each([
    ['user@EXAMPLE.test', 'user@example.test'],
    ['USER@EXAMPLE.TEST', 'USER@example.test'],
  ])(
    'accepts recipient %s while preserving the local-part case',
    async (to, envelope) => {
      const { sender, peer } = await setup();
      await expect(sender.send({ ...message, to })).resolves.toEqual({
        status: 'accepted',
        messageId: message.messageId,
      });
      expect(
        peer.commands.filter((command) => command.startsWith('RCPT TO')),
      ).toEqual([`RCPT TO:<${envelope}>`]);
      expect(peer.messages).toHaveLength(1);
    },
  );

  it.each([
    ['reject_recipient_temporary', 'retryable'],
    ['reject_recipient_permanent', 'permanent'],
    ['reject_data_temporary', 'retryable'],
    ['reject_data_permanent', 'permanent'],
    ['disconnect_data', 'uncertain'],
  ] as const)(
    'classifies %s without retaining provider content',
    async (behavior, disposition) => {
      const logs = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'info'),
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'error'),
      ];
      const { sender, peer } = await setup(behavior);
      const result: unknown = await sender
        .send(message)
        .catch((error: unknown) => error);
      expect(result).toBeInstanceOf(EmailDeliveryError);
      expect(result).toMatchObject({
        disposition,
        message: `EMAIL_DELIVERY_${disposition.toUpperCase()}`,
      });
      expect(String(result)).not.toContain('private-recipient');
      expect(String(result)).not.toContain('secret://canary');
      expect(JSON.stringify(result)).not.toContain('private-recipient');
      expect(result).not.toHaveProperty('response');
      expect(result).not.toHaveProperty('cause');
      expect(
        peer.commands.some((command) => command.startsWith('RCPT TO')),
      ).toBe(true);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    },
  );

  it('bounds a greeting wait as definitely unsent and retryable', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { sender, peer } = await setup('silent_greeting');
    let outcome: unknown;
    const pending = sender.send(message).catch((error: unknown) => {
      outcome = error;
    });
    await peer.connection;
    await setImmediate();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(outcome).toMatchObject({
      disposition: 'retryable',
      message: 'EMAIL_DELIVERY_RETRYABLE',
    });
    await pending;
    expect(peer.messages).toHaveLength(0);
  });

  it.each([
    'silent_auth',
    'silent_mail',
    'silent_rcpt',
    'silent_data_command',
  ] as const)(
    'retries a deadline at %s before any message content is sent',
    async (behavior) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { sender, peer } = await setup(behavior, true);
      const pending = sender.send(message).catch((error: unknown) => error);
      await peer.commandReceived;
      await vi.advanceTimersByTimeAsync(40_001);
      await expect(pending).resolves.toMatchObject({
        disposition: 'retryable',
      });
      expect(peer.messages).toEqual([]);
    },
  );

  it('retries a transient STARTTLS connection reset before any message content', async () => {
    const { sender, peer } = await setup('disconnect_tls');
    const pending = sender.send(message).catch((error: unknown) => error);
    await peer.commandReceived;
    await expect(pending).resolves.toMatchObject({ disposition: 'retryable' });
    expect(peer.commands).toContain('STARTTLS');
    expect(peer.messages).toEqual([]);
  });

  it('retries an ETLS transport failure during STARTTLS setup', async () => {
    // Nodemailer wraps setup errors as ETLS, whereas native handshake reset
    // events can arrive first as ESOCKET. Exercise both public error paths.
    const handshake = vi.spyOn(tls, 'connect').mockImplementationOnce(() => {
      throw Object.assign(new Error('Synthetic connection reset'), {
        code: 'ECONNRESET',
      });
    });
    const { sender, peer } = await setup('disconnect_tls');
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'retryable',
    });
    expect(handshake).toHaveBeenCalledOnce();
    expect(peer.commands).toContain('STARTTLS');
    expect(peer.messages).toEqual([]);
  });

  it('cancels a silent post-DATA acceptance wait at the absolute deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { sender, peer } = await setup('silent_data');
    let outcome: unknown;
    const pending = sender.send(message).catch((error: unknown) => {
      outcome = error;
    });
    await peer.dataReceived;
    expect(peer.messages).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(40_001);
    expect(outcome).toMatchObject({ disposition: 'uncertain' });
    await pending;
  });

  it('close cancels actual sockets without retrying an ambiguous accepted message', async () => {
    const { sender, peer } = await setup('silent_data');
    const pending = sender.send(message).catch((error: unknown) => error);
    await peer.dataReceived;
    sender.close();
    sender.close();
    await expect(pending).resolves.toMatchObject({ disposition: 'uncertain' });
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'retryable',
    });
    expect(peer.messages).toHaveLength(1);
  });

  it('classifies a refused TCP connection as definitely unsent and retryable', async () => {
    const peer = await smtpFixture();
    await peer.close();
    const sender = createSmtpEmailSender({
      url: peer.url,
    });
    senders.push(sender);
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'retryable',
    });
  });

  it('decodes authority credentials without enabling transport logging', async () => {
    const { peer } = await setup();
    const url = new URL(peer.url);
    url.username = 'test%40account';
    url.password = 'smtp%3Acanary';
    const sender = createSmtpEmailSender({ url: url.toString() });
    senders.push(sender);
    expect((await sender.send(message)).status).toBe('accepted');
    const auth = peer.commands.find((command) =>
      command.startsWith('AUTH PLAIN '),
    );
    expect(auth).toBeTruthy();
    expect(
      Buffer.from(auth!.slice('AUTH PLAIN '.length), 'base64').toString(),
    ).toBe('\0test@account\0smtp:canary');
  });

  it('requires STARTTLS outside the explicit loopback development authorities', async () => {
    const { peer } = await setup();
    const url = new URL(peer.url);
    url.hostname = 'localhost.';
    const sender = createSmtpEmailSender({ url: url.toString() });
    senders.push(sender);
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'permanent',
    });
    expect(peer.commands).toContain('STARTTLS');
    expect(peer.messages).toHaveLength(0);
    expect(peer.commands.some((command) => command.startsWith('RCPT TO'))).toBe(
      false,
    );
  });

  it.each([
    'smtp://user:secret@host.test?logger=true',
    'smtp://host.test#fragment',
    'smtp://host.test/mail',
    'https://host.test',
    'smtp://user:%ZZ@host.test',
    'smtp://user:%0a@host.test',
  ])(
    'refuses unsupported SMTP configuration %i without echoing its values',
    (url) => {
      const spy = vi.spyOn(nodemailer, 'createTransport');
      expect(() => createSmtpEmailSender({ url })).toThrow(
        'SMTP_CONFIGURATION_INVALID',
      );
      expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each([
    { to: 'one@example.test,two@example.test' },
    { from: 'one@example.test,two@example.test' },
    { subject: 'Unsafe\r\nBcc: other@example.test' },
    { messageId: '<unsafe@example.test>\r\nBcc: other@example.test' },
    { text: 'x'.repeat(256 * 1024 + 1) },
    { to: `${'x'.repeat(255)}@example.test` },
    { from: { address: `${'x'.repeat(255)}@example.test` } },
    { replyTo: { address: `${'x'.repeat(255)}@example.test` } },
  ])(
    'refuses malformed or multi-recipient messages before connecting',
    async (override) => {
      const { sender, peer } = await setup();
      await expect(
        sender.send({ ...message, ...override }),
      ).rejects.toMatchObject({ disposition: 'permanent' });
      expect(peer.commands).toEqual([]);
    },
  );
});
