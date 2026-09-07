import type { IncomingMessage, RequestOptions } from 'node:http';
import { request } from 'node:https';
import { createServer, type Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailSender,
} from '../email-sender.ts';
import { createPostmarkEmailSender } from '../postmark-email-sender.ts';
import { postmarkFixture, type PostmarkReply } from './postmark-fixture.ts';

const routing = vi.hoisted(() => ({
  url: '',
  nativeTLS: false,
  response: Promise.withResolvers<void>(),
}));
vi.mock('node:https', async (importOriginal) => {
  const http = await import('node:http');
  const https = await importOriginal<typeof import('node:https')>();
  return {
    request: vi.fn(
      (
        _url: string,
        options: RequestOptions,
        callback: (response: IncomingMessage) => void,
      ) => {
        if (!routing.url) throw new Error('No local Postmark test receiver');
        const received = (response: IncomingMessage) => {
          callback(response);
          routing.response.resolve();
        };
        if (routing.nativeTLS)
          return https.request(routing.url, options, received);
        const outgoing = http.request(routing.url, options, received);
        // The local plaintext receiver stands in for an already established
        // TLS channel. Native TLS failure is exercised separately below.
        outgoing.once('socket', (socket) => {
          socket.once('connect', () => socket.emit('secureConnect'));
        });
        return outgoing;
      },
    ),
  };
});

const message: EmailMessage = {
  from: 'Network Canvas <sender@example.test>',
  to: 'private-recipient@example.test',
  subject: 'Private subject canary',
  text: 'private body canary https://studio.example.test/secret-token',
  messageId: '<fixture-message@networkcanvas.local>',
};
const serverToken = 'postmark-token-canary';
const responseCanary =
  'secret://response-canary private-recipient@example.test';

describe('bounded Postmark EmailSender through actual HTTP sockets', () => {
  const peers: Awaited<ReturnType<typeof postmarkFixture>>[] = [];
  const senders: EmailSender[] = [];
  const setup = async (reply?: PostmarkReply, messageStream?: string) => {
    const peer = await postmarkFixture(reply);
    peers.push(peer);
    routing.url = peer.url;
    const sender = createPostmarkEmailSender({ serverToken, messageStream });
    senders.push(sender);
    return { peer, sender };
  };
  afterEach(async () => {
    for (const sender of senders.splice(0)) sender.close();
    for (const peer of peers.splice(0)) await peer.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    routing.url = '';
    routing.nativeTLS = false;
    routing.response = Promise.withResolvers<void>();
  });

  it('delivers exact content once with disabled tracking and the caller RFC Message-ID', async () => {
    const { peer, sender } = await setup();
    await expect(
      sender.send({
        ...message,
        replyTo: { name: 'Study "A", team', address: 'reply@example.test' },
      }),
    ).resolves.toEqual({ status: 'accepted', messageId: message.messageId });
    expect(peer.messages).toHaveLength(1);
    expect(peer.messages[0]).toMatchObject({
      method: 'POST',
      url: '/email',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': serverToken,
      },
    });
    expect(peer.messages[0]?.body).toEqual({
      From: '"Network Canvas" <sender@example.test>',
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      ReplyTo: '"Study \\"A\\", team" <reply@example.test>',
      Headers: [{ Name: 'Message-ID', Value: message.messageId }],
      MessageStream: 'outbound',
      TrackOpens: false,
      TrackLinks: 'None',
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'https://api.postmarkapp.com/email',
      expect.objectContaining({
        agent: false,
        rejectUnauthorized: true,
        maxHeaderSize: 8192,
      }),
      expect.any(Function),
    );
  });

  it('uses a configured stream and preserves local-part case while normalizing its domain', async () => {
    const { peer, sender } = await setup(undefined, 'studio-transactional');
    const receipt = await sender.send({ ...message, to: 'USER@EXAMPLE.TEST' });
    expect(receipt.messageId).toBe(message.messageId);
    expect(peer.messages[0]?.body).toMatchObject({
      To: 'USER@example.test',
      MessageStream: 'studio-transactional',
    });
  });

  it('generates a valid RFC Message-ID only when the caller did not select one', async () => {
    const { peer, sender } = await setup();
    const result = await sender.send({ ...message, messageId: undefined });
    expect(result.messageId).toMatch(/^<[\da-f-]{36}@networkcanvas\.local>$/);
    expect(peer.messages[0]?.body.Headers).toEqual([
      { Name: 'Message-ID', Value: result.messageId },
    ]);
  });

  it('matches provider receipt domains case-insensitively, while refusing a changed local part', async () => {
    const { peer, sender } = await setup({
      body: {
        ErrorCode: 0,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        To: 'USER@EXAMPLE.TEST',
      },
    });
    await expect(
      sender.send({ ...message, to: 'USER@example.test' }),
    ).resolves.toMatchObject({ status: 'accepted' });
    await expect(
      sender.send({ ...message, to: 'user@example.test' }),
    ).rejects.toMatchObject({ disposition: 'uncertain' });
    expect(peer.messages).toHaveLength(2);
  });

  it.each([
    [401, 10, 'permanent'],
    [404, undefined, 'permanent'],
    [413, undefined, 'permanent'],
    [415, undefined, 'permanent'],
    [422, 300, 'permanent'],
    [422, 406, 'permanent'],
    [422, 1235, 'permanent'],
    [429, undefined, 'retryable'],
    [503, 100, 'retryable'],
    [500, 101, 'uncertain'],
    [502, undefined, 'uncertain'],
    [503, undefined, 'uncertain'],
    [504, undefined, 'uncertain'],
    [408, undefined, 'uncertain'],
  ] as const)(
    'classifies HTTP %i / code %s without retaining provider data',
    async (status, ErrorCode, disposition) => {
      const logs = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'info'),
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'error'),
      ];
      const { sender, peer } = await setup({
        status,
        body: { ErrorCode, Message: responseCanary, Token: serverToken },
      });
      const error: unknown = await sender
        .send(message)
        .catch((value: unknown) => value);
      expect(error).toBeInstanceOf(EmailDeliveryError);
      expect(error).toMatchObject({
        disposition,
        message: `EMAIL_DELIVERY_${disposition.toUpperCase()}`,
      });
      const diagnostic = JSON.stringify(error) + String(error);
      for (const canary of [
        message.to,
        message.text,
        message.subject,
        responseCanary,
        serverToken,
      ]) {
        expect(diagnostic).not.toContain(canary);
      }
      expect(error).not.toHaveProperty('cause');
      expect(error).not.toHaveProperty('response');
      expect(peer.messages).toHaveLength(1);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    { body: { ErrorCode: 0 } },
    { body: { ErrorCode: 300, Message: responseCanary } },
    {
      body: {
        ErrorCode: 300,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        To: message.to,
      },
    },
    { body: { ErrorCode: 0, MessageID: 'invalid', To: message.to } },
    {
      body: {
        ErrorCode: 0,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        To: 'another@example.test',
      },
    },
    {
      status: 429,
      body: {
        ErrorCode: 0,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        To: message.to,
      },
    },
    {
      status: 503,
      body: {
        ErrorCode: 100,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        Message: responseCanary,
      },
    },
    { status: 202 },
    { contentType: 'text/html' },
    { rawBody: '{"ErrorCode":0' },
    { behavior: 'partial' },
    { behavior: 'disconnect' },
    { behavior: 'redirect' },
  ] satisfies PostmarkReply[])(
    'treats unproven/contradictory acceptance as terminal uncertainty %#',
    async (reply) => {
      const { peer, sender } = await setup(reply);
      await expect(sender.send(message)).rejects.toMatchObject({
        disposition: 'uncertain',
      });
      expect(peer.messages).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds the response bytes and releases a streaming socket', async () => {
    const { peer, sender } = await setup({ behavior: 'oversized' });
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'uncertain',
    });
    await peer.disconnected;
    expect(peer.messages).toHaveLength(1);
  });

  it.each([
    [429, 'retryable'],
    [401, 'permanent'],
    [422, 'permanent'],
    [408, 'uncertain'],
    [200, 'uncertain'],
    [503, 'uncertain'],
  ] as const)(
    'preserves HTTP %i disposition when a received response is canceled',
    async (status, disposition) => {
      for (const interruption of [
        'deadline',
        'shutdown',
        'disconnect',
        'oversized',
      ] as const) {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        routing.response = Promise.withResolvers<void>();
        const { sender, peer } = await setup({
          status,
          behavior: interruption === 'oversized' ? 'oversized' : 'stall-body',
        });
        let outcome: unknown;
        const pending = sender.send(message).catch((error: unknown) => {
          outcome = error;
        });
        // The real client has received headers before interruption; observing
        // only server-side receipt would race the disposition under test.
        await routing.response.promise;
        if (interruption !== 'oversized') expect(outcome).toBeUndefined();
        if (interruption === 'deadline') {
          await vi.advanceTimersByTimeAsync(29_999);
          expect(outcome).toBeUndefined();
          await vi.advanceTimersByTimeAsync(2);
        } else if (interruption === 'shutdown') sender.close();
        else if (interruption === 'disconnect') peer.disconnect();
        await pending;
        expect(outcome, interruption).toMatchObject({ disposition });
        await peer.disconnected;
        expect(peer.messages).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
      }
    },
  );

  it('refuses an oversized but otherwise valid provider acceptance', async () => {
    const { peer, sender } = await setup({
      body: {
        ErrorCode: 0,
        MessageID: '1ac5d3e3-a84d-42d3-a782-61246c7c4d21',
        To: message.to,
        ignoredCanary: 'x'.repeat(16 * 1024),
      },
    });
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'uncertain',
    });
    expect(peer.messages).toHaveLength(1);
  });

  it('bounds provider headers and closes the rejected response socket', async () => {
    const { peer, sender } = await setup({
      headers: { 'X-Provider-Canary': 'x'.repeat(8193) },
    });
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'uncertain',
    });
    await peer.disconnected;
    expect(peer.messages).toHaveLength(1);
  });

  it('bounds a silent response by the absolute deadline and destroys its socket', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { peer, sender } = await setup({ behavior: 'silent' });
    let outcome: unknown;
    const pending = sender.send(message).catch((error: unknown) => {
      outcome = error;
    });
    await peer.received();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    expect(outcome).toMatchObject({ disposition: 'uncertain' });
    await pending;
    await peer.disconnected;
    expect(peer.messages).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close cancels all in-flight sockets and prevents later connection attempts', async () => {
    const { peer, sender } = await setup({ behavior: 'silent' });
    const pending = Promise.all([
      sender.send(message).catch((error: unknown) => error),
      sender.send(message).catch((error: unknown) => error),
    ]);
    await peer.received(2);
    sender.close();
    sender.close();
    await expect(pending).resolves.toMatchObject([
      { disposition: 'uncertain' },
      { disposition: 'uncertain' },
    ]);
    await peer.disconnected;
    const later = sender.send(message).catch((error: unknown) => error);
    expect(request).toHaveBeenCalledTimes(2);
    await expect(later).resolves.toMatchObject({
      disposition: 'retryable',
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(peer.messages).toHaveLength(2);
  });

  it('a refused connection is definitely unsent and retryable', async () => {
    const peer = await postmarkFixture();
    await peer.close();
    routing.url = peer.url;
    const sender = createPostmarkEmailSender({ serverToken });
    senders.push(sender);
    await expect(sender.send(message)).rejects.toMatchObject({
      disposition: 'retryable',
    });
    expect(peer.messages).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(['timeout', 'reset'] as const)(
    'a native TLS handshake %s is definitely unsent, bounded and retryable',
    async (behavior) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const hello = Promise.withResolvers<void>();
      const disconnected = Promise.withResolvers<void>();
      const sockets = new Set<Socket>();
      const received: Buffer[] = [];
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('data', (chunk: Buffer) => {
          received.push(chunk);
          hello.resolve();
          if (behavior === 'reset') socket.destroy();
        });
        socket.on('close', () => {
          sockets.delete(socket);
          disconnected.resolve();
        });
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('No TLS fixture port');
      routing.url = `https://127.0.0.1:${address.port}/email`;
      routing.nativeTLS = true;
      const sender = createPostmarkEmailSender({ serverToken });
      senders.push(sender);
      try {
        let outcome: unknown;
        const pending = sender.send(message).catch((error: unknown) => {
          outcome = error;
        });
        await hello.promise;
        const wire = Buffer.concat(received);
        expect(wire[0]).toBe(0x16); // A real TLS handshake record, not an HTTP send.
        expect(wire.toString()).not.toContain(serverToken);
        expect(wire.toString()).not.toContain(message.text);
        if (behavior === 'timeout') {
          await vi.advanceTimersByTimeAsync(9999);
          expect(outcome).toBeUndefined();
          await vi.advanceTimersByTimeAsync(2);
        }
        await pending;
        expect(outcome).toMatchObject({ disposition: 'retryable' });
        await disconnected.promise;
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        sender.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );

  it.each([
    { to: 'one@example.test,two@example.test' },
    { from: 'one@example.test,two@example.test' },
    { subject: 'Unsafe\r\nBcc: other@example.test' },
    { messageId: '<unsafe@example.test>\r\nBcc: other@example.test' },
    { text: 'x'.repeat(256 * 1024 + 1) },
    { text: '' },
    { from: { name: 'x'.repeat(256), address: 'sender@example.test' } },
    { replyTo: { name: 'private\ud800', address: 'reply@example.test' } },
  ])(
    'refuses malformed or multi-recipient input before connecting %#',
    async (override) => {
      const { peer, sender } = await setup();
      await expect(
        sender.send({ ...message, ...override }),
      ).rejects.toMatchObject({ disposition: 'permanent' });
      expect(request).not.toHaveBeenCalled();
      expect(peer.messages).toHaveLength(0);
    },
  );

  it.each([
    { serverToken: '' },
    { serverToken: 'secret\ncanary' },
    { serverToken: 'secret'.repeat(100) },
    { serverToken, messageStream: 'bad stream' },
    { serverToken, messageStream: 'x'.repeat(31) },
    { serverToken, endpoint: 'https://credential-trap.test' },
  ])(
    'refuses invalid configuration without printing credentials %#',
    (options) => {
      expect(() => createPostmarkEmailSender(options)).toThrow(
        'POSTMARK_CONFIGURATION_INVALID',
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
});
