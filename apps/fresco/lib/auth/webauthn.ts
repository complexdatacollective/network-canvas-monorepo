import 'server-only';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import { headers } from 'next/headers';

import { getInstallationId } from '~/queries/appSettings';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function deriveWebAuthnKey(installationId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', installationId, '', 'fresco-webauthn-challenge', 32),
  );
}

export async function getWebAuthnConfig() {
  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ??
    headerStore.get('referer') ??
    'http://localhost:3000';
  const url = new URL(origin);

  return {
    rpID: url.hostname,
    rpName: 'Fresco',
    origin: url.origin,
    attestationType: 'none' as const,
    authenticatorSelection: {
      // Must be 'required': sign-in generates usernameless authentication
      // options with no allowCredentials, so only discoverable (resident)
      // credentials can ever be offered. A non-resident credential would
      // register successfully and then lock a passkey-only account out.
      residentKey: 'required' as const,
      // Must be 'required': the documentation promises that a passkey sign-in
      // always proves the user's identity as well as possession of the
      // authenticator, so a response whose UV flag is unset is never enough.
      // requireUserVerification must stay in sync — when generation asks for
      // 'required', verification must reject responses without UV.
      userVerification: 'required' as const,
    },
    requireUserVerification: true,
  };
}

export async function createChallengeCookie(
  challenge: string,
): Promise<string> {
  const installationId = await getInstallationId();
  if (!installationId) {
    throw new Error('Installation ID not configured');
  }

  const key = deriveWebAuthnKey(installationId);
  const timestamp = Date.now().toString();
  const payload = `${challenge}:${timestamp}`;
  const payloadEncoded = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(payload)
    .digest('base64url');

  return `${payloadEncoded}:${signature}`;
}

export async function verifyChallengeCookie(
  cookie: string,
): Promise<string | null> {
  const installationId = await getInstallationId();
  if (!installationId) {
    return null;
  }

  const key = deriveWebAuthnKey(installationId);
  const separatorIndex = cookie.lastIndexOf(':');
  if (separatorIndex === -1) return null;

  const payloadEncoded = cookie.slice(0, separatorIndex);
  const signature = cookie.slice(separatorIndex + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadEncoded, 'base64url').toString();
  } catch {
    return null;
  }

  const expectedSignature = createHmac('sha256', key)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  const colonIndex = payload.lastIndexOf(':');
  if (colonIndex === -1) return null;

  const challenge = payload.slice(0, colonIndex);
  const timestampStr = payload.slice(colonIndex + 1);
  const timestamp = Number(timestampStr);

  if (Number.isNaN(timestamp)) return null;
  if (Date.now() - timestamp > CHALLENGE_TTL_MS) return null;

  return challenge;
}
