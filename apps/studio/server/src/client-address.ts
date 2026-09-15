import { BlockList, isIPv4, isIPv6 } from 'node:net';

import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

// Who is calling, for the rate-limit scopes keyed by client address (#1909).
//
// The address that can be trusted is the socket's peer. `X-Forwarded-For` is
// written by the client as easily as by a proxy, so reading it unconditionally
// would hand every request a fresh rate-limit bucket and turn every
// address-keyed limit into a no-op. It is therefore read only when the peer is
// one of `TRUSTED_PROXIES`, and then only from the right: each hop appends,
// so the rightmost entry that is not itself a trusted proxy is the last
// address a trusted party observed. Everything to the left of it was supplied
// by whoever is being limited.
//
// better-auth resolves its own address for its own limiter, from the same
// variable (src/auth/better-auth.ts). Two resolutions of one idea, kept
// separate on purpose: better-auth's is inside a library Studio does not
// control, and replacing it would mean patching a code path that its own
// tests, not Studio's, hold to this behaviour.

/** What a request whose peer address cannot be read is counted against. */
const UNKNOWN_ADDRESS = 'unknown';

/**
 * `::ffff:198.51.100.7` and `198.51.100.7` are the same client, and a limit
 * that gave them two buckets would be twice as loose for anything reaching the
 * process over a dual-stack socket.
 */
function normalize(address: string): string {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (isIPv4(mapped)) return mapped;
  }
  // A link-local address carries a zone (`fe80::1%eth0`); the zone is a
  // property of this host's interface, not of the caller.
  const zone = lower.indexOf('%');
  return zone === -1 ? lower : lower.slice(0, zone);
}

function familyOf(address: string): 'ipv4' | 'ipv6' | null {
  if (isIPv4(address)) return 'ipv4';
  if (isIPv6(address)) return 'ipv6';
  return null;
}

/**
 * The proxies whose forwarded header may be believed, as a `BlockList` —
 * node's own CIDR matcher, so the parsing and the comparison agree.
 *
 * An unparseable entry is dropped rather than refused at boot: the effect of
 * dropping one is that its proxy is not trusted, which means client addresses
 * collapse to that proxy's own address and limits get stricter. Refusing the
 * boot would make a typo in a comma-separated list an outage.
 */
export function createTrustedProxies(
  entries: readonly string[] | undefined,
): BlockList | undefined {
  if (!entries || entries.length === 0) return undefined;
  const list = new BlockList();
  const rejected: string[] = [];
  for (const entry of entries) {
    const slash = entry.lastIndexOf('/');
    const address = normalize(slash === -1 ? entry : entry.slice(0, slash));
    const family = familyOf(address);
    if (!family) {
      rejected.push(entry);
      continue;
    }
    if (slash === -1) {
      list.addAddress(address, family);
      continue;
    }
    const prefix = Number(entry.slice(slash + 1));
    const maxBits = family === 'ipv4' ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) {
      rejected.push(entry);
      continue;
    }
    list.addSubnet(address, prefix, family);
  }
  if (rejected.length > 0) {
    // oxlint-disable-next-line no-console -- configuration diagnostics
    console.warn(
      `TRUSTED_PROXIES entries are not addresses or CIDR ranges and are ignored: ${rejected.join(', ')}. Requests through them are limited by the proxy's own address.`,
    );
  }
  return list;
}

function isTrusted(list: BlockList, address: string): boolean {
  const family = familyOf(address);
  return family !== null && list.check(address, family);
}

/** The socket peer, or `unknown` where the adapter exposes no connection. */
function peerAddress(c: Context): string {
  try {
    const address = getConnInfo(c).remote.address;
    return address ? normalize(address) : UNKNOWN_ADDRESS;
  } catch {
    // No connection information at all — an in-process `app.request()` in the
    // suites, or an adapter that does not expose one. Every such request
    // shares one bucket, which is the safe direction.
    return UNKNOWN_ADDRESS;
  }
}

/**
 * The address this request is rate-limited against.
 *
 * @param trustedProxies from `createTrustedProxies`; without it the forwarded
 * header is never read, whatever the request claims.
 */
export function clientAddress(
  c: Context,
  trustedProxies: BlockList | undefined,
): string {
  const peer = peerAddress(c);
  if (!trustedProxies || peer === UNKNOWN_ADDRESS) return peer;
  if (!isTrusted(trustedProxies, peer)) return peer;

  const forwarded = c.req.header('X-Forwarded-For');
  if (!forwarded) return peer;
  const hops = forwarded
    .split(',')
    .map((hop) => normalize(hop.trim()))
    .filter(Boolean);
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    // A hop that is not an address at all ends the walk: the chain to its left
    // was written by something that does not speak the header's grammar, and
    // trusting any of it would be trusting whatever wrote that.
    if (!hop || familyOf(hop) === null) return peer;
    if (!isTrusted(trustedProxies, hop)) return hop;
  }
  // Every hop was one of our own proxies, so none of them names a client.
  return peer;
}
