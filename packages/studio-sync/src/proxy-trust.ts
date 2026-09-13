import { isIP } from 'node:net';

import ipaddr from 'ipaddr.js';

export function isProxyAddress(value: string): boolean {
  const [address, prefix, extra] = value.split('/');
  if (!address || !isIP(address) || extra !== undefined) return false;
  if (prefix === undefined) return true;
  return /^\d+$/.test(prefix) && ipaddr.isValidCIDR(value);
}

/** Transport peer only. X-Forwarded-For/Forwarded can never establish trust. */
export function trustedPeer(
  address: string | undefined,
  proxies: readonly string[],
): boolean {
  if (!address || !isIP(address)) return false;
  const peer = ipaddr.process(address);
  return proxies.some((entry) => {
    if (!isProxyAddress(entry)) return false;
    const subnet = entry.includes('/')
      ? ipaddr.parseCIDR(entry)
      : ipaddr.parseCIDR(`${entry}/${isIP(entry) === 4 ? 32 : 128}`);
    return (
      ipaddr.subnetMatch(peer, { trusted: [subnet] }, 'untrusted') === 'trusted'
    );
  });
}
