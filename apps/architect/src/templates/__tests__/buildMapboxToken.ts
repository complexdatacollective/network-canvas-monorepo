/**
 * Builds a Mapbox-shaped public token at runtime, for tests. Real tokens are
 * `pk.<base64url JSON {"u": account, "a": token id}>.<signature>`, so a retired
 * token can be reconstructed from its id at test time without a token-shaped
 * literal ever being written into the repository — which GitHub push
 * protection would block, and which `scripts/check-mapbox-tokens.mjs` forbids
 * anywhere near a fixture. The signature is not verified by anything that
 * reads the token here, so any string will do.
 */
export const buildMapboxToken = (
  id: string,
  account = 'networkcanvas',
  signature = 'testsig',
): string =>
  ['pk', base64url(JSON.stringify({ u: account, a: id })), signature].join('.');

const base64url = (text: string): string =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
