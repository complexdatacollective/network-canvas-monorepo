import { afterEach, describe, expect, it, vi } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { Environment } from '../env.ts';
import { resolve } from '../env/resolve.ts';
import {
  ClientAddress,
  ClientAddressLive,
  createTrustedProxies,
  resolveClientAddress,
} from '../http/middleware/client-address.ts';

// Which address a rate limit is counted against (#1909). The case this exists
// for is the forged header: `X-Forwarded-For` is written by a client as easily
// as by a proxy, so believing one from a peer that is not a proxy would give
// every request a bucket of its own and make every address-keyed limit a
// no-op.

function resolveAddress(options: {
  /** Omitted means the transport exposed no peer at all. */
  peerAddress?: string | undefined;
  forwarded?: string;
  trustedProxies?: string[];
}): string {
  return resolveClientAddress(
    Option.fromUndefinedOr(options.peerAddress),
    options.forwarded,
    createTrustedProxies(options.trustedProxies),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the client address', () => {
  it('is the socket peer when no proxy is trusted', () => {
    expect(
      resolveAddress({
        peerAddress: '198.51.100.7',
        forwarded: '203.0.113.1',
      }),
    ).toBe('198.51.100.7');
  });

  it('ignores a header forged by an untrusted peer', () => {
    // The whole point: the caller is not one of our proxies, so what it claims
    // about who it is forwarding for is worth nothing — and believing it would
    // let one host mint a fresh rate-limit bucket per request.
    expect(
      resolveAddress({
        peerAddress: '198.51.100.7',
        forwarded: '203.0.113.1, 203.0.113.2',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('198.51.100.7');
  });

  it('takes the rightmost untrusted hop from a trusted peer', () => {
    // Each hop appends, so the entries to the left of the last trusted one are
    // whatever the client supplied. `203.0.113.9` is the last address one of
    // our own proxies observed.
    expect(
      resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '192.0.2.1, 203.0.113.9, 10.0.0.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('203.0.113.9');
  });

  it('falls back to the peer when every hop is one of our own proxies', () => {
    expect(
      resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '10.0.0.9, 10.0.0.8',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('10.0.0.5');
  });

  it('stops at a hop that is not an address at all', () => {
    // A chain written by something that does not speak the header's grammar;
    // nothing to its left can be trusted either.
    expect(
      resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '203.0.113.9, unknown, 10.0.0.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('10.0.0.5');
  });

  it('counts a dual-stack peer as the IPv4 client it is', () => {
    // Two buckets for one client would make the limit twice as loose.
    expect(resolveAddress({ peerAddress: '::ffff:198.51.100.7' })).toBe(
      '198.51.100.7',
    );
    expect(
      resolveAddress({
        peerAddress: '::ffff:10.0.0.5',
        forwarded: '203.0.113.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('203.0.113.9');
  });

  it('matches an IPv6 proxy range', () => {
    expect(
      resolveAddress({
        peerAddress: '2001:db8::5',
        forwarded: '203.0.113.9, 2001:db8::9',
        trustedProxies: ['2001:db8::/32'],
      }),
    ).toBe('203.0.113.9');
  });

  it('shares one bucket where the transport exposes no connection', () => {
    // An in-process request, or a transport with no socket. Everything then
    // counts together, which is blunt and safe — the direction that cannot be
    // exploited.
    expect(resolveAddress({ peerAddress: undefined })).toBe('unknown');
    expect(
      resolveAddress({
        peerAddress: undefined,
        forwarded: '203.0.113.1',
        trustedProxies: ['0.0.0.0/0'],
      }),
    ).toBe('unknown');
  });

  it('ignores an unparseable proxy entry and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '203.0.113.9',
        trustedProxies: ['not-an-address', '10.0.0.0/999', '10.0.0.0/8'],
      }),
    ).toBe('203.0.113.9');
    expect(
      warn.mock.calls.filter(([line]) =>
        String(line).includes('TRUSTED_PROXIES'),
      ),
    ).toHaveLength(1);
  });
});

/**
 * A peer for a request that has none, registered before `ClientAddressLive`
 * so it is outermost: a Web `Request` carries no socket, and this is the one
 * value only a real transport could supply.
 */
const PeerLive = (peer: string) =>
  HttpRouter.middleware(
    (httpEffect) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        Effect.provideService(
          httpEffect,
          HttpServerRequest.HttpServerRequest,
          request.modify({ remoteAddress: Option.some(peer) }),
        ),
      ),
    { global: true },
  );

describe('the middleware over a request', () => {
  it('hands a route the rightmost untrusted hop', async () => {
    // Mutation: take the first entry of the header — what
    // `HttpMiddleware.xForwardedHeaders` does — and this answers `192.0.2.1`,
    // the one value in the chain the client wrote for itself.
    const Routes = HttpRouter.use((router) =>
      router.add(
        'GET',
        '/who',
        Effect.map(ClientAddress, (address) =>
          HttpServerResponse.text(address),
        ),
      ),
    );
    const { handler, dispose } = HttpRouter.toWebHandler(
      Routes.pipe(
        Layer.provideMerge(
          ClientAddressLive.pipe(Layer.provideMerge(PeerLive('10.0.0.5'))),
        ),
        Layer.provide(
          Layer.succeed(
            Environment,
            resolve({ NODE_ENV: 'test', TRUSTED_PROXIES: ['10.0.0.0/8'] }),
          ),
        ),
      ),
      { disableLogger: true },
    );
    try {
      const response = await handler(
        new Request('http://studio.test/who', {
          headers: { 'X-Forwarded-For': '192.0.2.1, 203.0.113.9, 10.0.0.9' },
        }),
      );
      expect(await response.text()).toBe('203.0.113.9');
    } finally {
      await dispose();
    }
  });
});
