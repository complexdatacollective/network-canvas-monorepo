import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clientAddress, createTrustedProxies } from '../client-address.ts';

// Which address a rate limit is counted against (#1909). The case this exists
// for is the forged header: `X-Forwarded-For` is written by a client as easily
// as by a proxy, so believing one from a peer that is not a proxy would give
// every request a bucket of its own and make every address-keyed limit a
// no-op.

/** The shape `@hono/node-server`'s conninfo helper reads a peer address out of. */
function peer(address: string | undefined) {
  return {
    incoming: {
      socket: {
        remoteAddress: address,
        remotePort: 51_234,
        remoteFamily: address?.includes(':') ? 'IPv6' : 'IPv4',
      },
    },
  };
}

async function resolveAddress(options: {
  /** Omitted means the adapter exposed no bindings at all. */
  peerAddress?: string | undefined;
  noBindings?: boolean;
  forwarded?: string;
  trustedProxies?: string[];
}): Promise<string> {
  const trusted = createTrustedProxies(options.trustedProxies);
  const app = new Hono();
  app.get('/', (c) => c.text(clientAddress(c, trusted)));
  const response = await app.request(
    '/',
    options.forwarded
      ? { headers: { 'X-Forwarded-For': options.forwarded } }
      : {},
    // Hono's third argument is the adapter's bindings, which is where the node
    // adapter puts the incoming request and therefore the socket.
    options.noBindings ? undefined : peer(options.peerAddress),
  );
  return response.text();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the client address', () => {
  it('is the socket peer when no proxy is trusted', async () => {
    expect(
      await resolveAddress({
        peerAddress: '198.51.100.7',
        forwarded: '203.0.113.1',
      }),
    ).toBe('198.51.100.7');
  });

  it('ignores a header forged by an untrusted peer', async () => {
    // The whole point: the caller is not one of our proxies, so what it claims
    // about who it is forwarding for is worth nothing — and believing it would
    // let one host mint a fresh rate-limit bucket per request.
    expect(
      await resolveAddress({
        peerAddress: '198.51.100.7',
        forwarded: '203.0.113.1, 203.0.113.2',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('198.51.100.7');
  });

  it('takes the rightmost untrusted hop from a trusted peer', async () => {
    // Each hop appends, so the entries to the left of the last trusted one are
    // whatever the client supplied. `203.0.113.9` is the last address one of
    // our own proxies observed.
    expect(
      await resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '192.0.2.1, 203.0.113.9, 10.0.0.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('203.0.113.9');
  });

  it('falls back to the peer when every hop is one of our own proxies', async () => {
    expect(
      await resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '10.0.0.9, 10.0.0.8',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('10.0.0.5');
  });

  it('stops at a hop that is not an address at all', async () => {
    // A chain written by something that does not speak the header's grammar;
    // nothing to its left can be trusted either.
    expect(
      await resolveAddress({
        peerAddress: '10.0.0.5',
        forwarded: '203.0.113.9, unknown, 10.0.0.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('10.0.0.5');
  });

  it('counts a dual-stack peer as the IPv4 client it is', async () => {
    // Two buckets for one client would make the limit twice as loose.
    expect(await resolveAddress({ peerAddress: '::ffff:198.51.100.7' })).toBe(
      '198.51.100.7',
    );
    expect(
      await resolveAddress({
        peerAddress: '::ffff:10.0.0.5',
        forwarded: '203.0.113.9',
        trustedProxies: ['10.0.0.0/8'],
      }),
    ).toBe('203.0.113.9');
  });

  it('matches an IPv6 proxy range', async () => {
    expect(
      await resolveAddress({
        peerAddress: '2001:db8::5',
        forwarded: '203.0.113.9, 2001:db8::9',
        trustedProxies: ['2001:db8::/32'],
      }),
    ).toBe('203.0.113.9');
  });

  it('shares one bucket where the adapter exposes no connection', async () => {
    // An in-process request, or an adapter with no socket. Everything then
    // counts together, which is blunt and safe — the direction that cannot be
    // exploited.
    expect(await resolveAddress({ peerAddress: undefined })).toBe('unknown');
    expect(await resolveAddress({ noBindings: true })).toBe('unknown');
    expect(
      await resolveAddress({
        peerAddress: undefined,
        forwarded: '203.0.113.1',
        trustedProxies: ['0.0.0.0/0'],
      }),
    ).toBe('unknown');
  });

  it('ignores an unparseable proxy entry and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      await resolveAddress({
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
