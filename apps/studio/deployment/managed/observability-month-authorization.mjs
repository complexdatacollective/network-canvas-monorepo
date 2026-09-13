import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

import { canonicalize } from '../../../../packages/studio-sync/src/apply.ts';

const SHA256 = /^[a-f0-9]{64}$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL_64 = /^[A-Za-z0-9_-]{86}$/;
const MAX_VALIDITY_MS = 15 * 60_000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).toSorted().join() === keys.toSorted().join();

const canonicalTime = (value) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;

function decodeBase64url(value, pattern, bytes) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.byteLength !== bytes || decoded.toString('base64url') !== value)
    throw new Error();
  return decoded;
}

function validateApproval(value, now) {
  if (
    !exact(value, [
      'accountIdentitySha256',
      'expiresAt',
      'issuedAt',
      'nextStateSha256',
      'previousStateSha256',
      'targetMonthUtc',
    ]) ||
    !SHA256.test(value.accountIdentitySha256) ||
    !SHA256.test(value.previousStateSha256) ||
    !SHA256.test(value.nextStateSha256) ||
    !MONTH.test(value.targetMonthUtc) ||
    !canonicalTime(value.issuedAt) ||
    !canonicalTime(value.expiresAt)
  )
    throw new Error();
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (
    !Number.isFinite(now) ||
    issuedAt > now ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_VALIDITY_MS
  )
    throw new Error();
  return structuredClone(value);
}

export function createMonthAuthorizationVerifier({
  accountIdentitySha256,
  authorityKeyId,
  authorityPublicKey,
  now = Date.now,
}) {
  if (
    !SHA256.test(accountIdentitySha256) ||
    !KEY_ID.test(authorityKeyId) ||
    typeof now !== 'function'
  )
    throw new Error('ANCHOR_MONTH_AUTHORIZATION_CONFIGURATION_INVALID');
  let publicKey;
  try {
    const raw = decodeBase64url(authorityPublicKey, BASE64URL_32, 32);
    publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new Error('ANCHOR_MONTH_AUTHORIZATION_CONFIGURATION_INVALID');
  }
  return async ({ authorization, previous, next, signal }) => {
    try {
      signal?.throwIfAborted();
      if (typeof authorization !== 'string' || authorization.length > 4096)
        return false;
      const receipt = JSON.parse(authorization);
      if (
        !exact(receipt, [
          'approval',
          'authorityKeyId',
          'format',
          'signature',
          'version',
        ]) ||
        receipt.format !== 'studio-observability-anchor-month-authorization' ||
        receipt.version !== 1 ||
        receipt.authorityKeyId !== authorityKeyId
      )
        return false;
      if (canonicalize(receipt) !== authorization) return false;
      const observedAt = now();
      const approval = validateApproval(receipt.approval, observedAt);
      // Signatures can be prepared shortly before rollover, but cannot spend
      // a future month's allowance or reactivate a past month's counters.
      if (
        approval.targetMonthUtc !==
        new Date(observedAt).toISOString().slice(0, 7)
      )
        return false;
      if (
        approval.accountIdentitySha256 !== accountIdentitySha256 ||
        approval.previousStateSha256 !== previous.stateSha256 ||
        approval.nextStateSha256 !== next.stateSha256 ||
        approval.targetMonthUtc !== next.monthUtc
      )
        return false;
      const signature = decodeBase64url(receipt.signature, BASE64URL_64, 64);
      signal?.throwIfAborted();
      return verify(
        null,
        Buffer.from(
          canonicalize({
            format: receipt.format,
            version: receipt.version,
            authorityKeyId: receipt.authorityKeyId,
            approval,
          }),
          'utf8',
        ),
        publicKey,
        signature,
      );
    } catch {
      signal?.throwIfAborted();
      return false;
    }
  };
}

export function signMonthAuthorization({ approval, authorityKeyId, key, now }) {
  if (!KEY_ID.test(authorityKeyId))
    throw new Error('ANCHOR_MONTH_AUTHORIZATION_INPUT_INVALID');
  try {
    const validated = validateApproval(approval, now);
    const privateKey = createPrivateKey(key);
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error();
    const signed = {
      format: 'studio-observability-anchor-month-authorization',
      version: 1,
      authorityKeyId,
      approval: validated,
    };
    const receipt = {
      ...signed,
      signature: sign(
        null,
        Buffer.from(canonicalize(signed), 'utf8'),
        privateKey,
      ).toString('base64url'),
    };
    if (!BASE64URL_64.test(receipt.signature)) throw new Error();
    return receipt;
  } catch {
    throw new Error('ANCHOR_MONTH_AUTHORIZATION_INPUT_INVALID');
  }
}

export function rawEd25519PublicKey(privateKey) {
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    const jwk = createPublicKey(key).export({ format: 'jwk' });
    return decodeBase64url(jwk.x, BASE64URL_32, 32).toString('base64url');
  } catch {
    throw new Error('ANCHOR_MONTH_AUTHORIZATION_INPUT_INVALID');
  }
}
