import {
  generateAuthenticationOptions as generateAuthOptions,
  generateRegistrationOptions as generateRegOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createServerFn } from '@tanstack/react-start';
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server';

import { env } from '~/env';
import { getAuthenticatorName } from '~/lib/auth/utils/getAuthenticatorName';
import {
  createChallengeCookie,
  getWebAuthnConfig,
  verifyChallengeCookie,
} from '~/lib/auth/webauthn';
import { prisma } from '~/lib/db';
import { checkRateLimit, recordLoginAttempt } from '~/lib/rateLimit';
import { isAppConfigured } from '~/queries/appSettings';
import { addEvent } from '~/src/server/activityFeed';
import { getClientIp } from '~/src/server/clientIp';
import { authed } from '~/src/server/middleware';
import { createSessionCookie } from '~/src/server/session';

/**
 * The passkey register and sign-in paths from `actions/webauthn.ts`.
 *
 * This is the surface spike S2 exists to de-risk: both flows read and clear a
 * `sameSite: 'strict'` challenge cookie and then set a `sameSite: 'lax'`
 * session cookie in the same server function, and the two attribute sets
 * cannot be collapsed into one `Set-Cookie` header.
 */

const CHALLENGE_COOKIE_NAME = 'webauthn_challenge';

function splitTransports(
  transports: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!transports) return undefined;
  return transports.split(',') as AuthenticatorTransportFuture[];
}

async function setChallengeCookie(challenge: string) {
  setCookie(CHALLENGE_COOKIE_NAME, await createChallengeCookie(challenge), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 300, // 5 minutes
  });
}

async function getAndClearChallengeCookie(): Promise<string | null> {
  const cookieValue = getCookie(CHALLENGE_COOKIE_NAME);
  deleteCookie(CHALLENGE_COOKIE_NAME);
  if (!cookieValue) return null;
  return verifyChallengeCookie(cookieValue);
}

// --- Registration (requires an authenticated session) ---

export const generateRegistrationOptions = createServerFn({ method: 'POST' })
  .middleware([authed])
  .handler(async ({ context }) => {
    const config = await getWebAuthnConfig();

    const existingCredentials = await prisma.webAuthnCredential.findMany({
      where: { user_id: context.session.user.userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: context.session.user.username,
      attestationType: config.attestationType,
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: splitTransports(credential.transports),
      })),
      authenticatorSelection: config.authenticatorSelection,
    });

    await setChallengeCookie(options.challenge);

    return { error: null, data: { options } };
  });

// --- Registration during setup, before any account exists ---

export const signupWithPasskey = createServerFn({ method: 'POST' })
  .validator(
    (data: { username: string; credential: RegistrationResponseJSON }) => data,
  )
  .handler(async ({ data }) => {
    const { username, credential } = data;

    if (await isAppConfigured()) {
      return { error: 'Setup is already complete.', data: null };
    }

    if (!username || username.length < 4) {
      return { error: 'Username must be at least 4 characters.', data: null };
    }

    const config = await getWebAuthnConfig();

    const challenge = await getAndClearChallengeCookie();
    if (!challenge) {
      return { error: 'Challenge expired. Please try again.', data: null };
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: config.requireUserVerification,
      });
    } catch {
      return { error: 'Registration verification failed.', data: null };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Registration verification failed.', data: null };
    }

    const {
      credential: verifiedCredential,
      credentialDeviceType,
      credentialBackedUp,
      aaguid,
    } = verification.registrationInfo;

    const friendlyName = getAuthenticatorName(aaguid, credentialDeviceType);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          username,
          key: {
            create: { id: `username:${username}`, hashed_password: null },
          },
          webAuthnCredentials: {
            create: {
              credentialId: verifiedCredential.id,
              publicKey: Buffer.from(verifiedCredential.publicKey).toString(
                'base64url',
              ),
              counter: BigInt(verifiedCredential.counter),
              transports: verifiedCredential.transports?.join(',') ?? null,
              deviceType: credentialDeviceType,
              backedUp: credentialBackedUp,
              aaguid,
              friendlyName,
            },
          },
        },
      });
    } catch {
      return { error: 'Username already taken.', data: null };
    }

    // The delete-then-set pair, variant one. See spike S2.
    await createSessionCookie(user.id);

    void addEvent(
      'User Created',
      `User ${username} created an account with a passkey (${friendlyName})`,
    );

    return { error: null, data: { success: true } };
  });

// --- Authentication ---

export const generateAuthenticationOptions = createServerFn({
  method: 'POST',
}).handler(async () => {
  const config = await getWebAuthnConfig();

  const options = await generateAuthOptions({
    rpID: config.rpID,
    userVerification: config.authenticatorSelection.userVerification,
  });

  await setChallengeCookie(options.challenge);

  return { error: null, data: { options } };
});

export const verifyAuthentication = createServerFn({ method: 'POST' })
  .validator((data: { credential: AuthenticationResponseJSON }) => data)
  .handler(async ({ data }) => {
    const ipAddress = getClientIp();

    const rateLimitResult = await checkRateLimit(null, ipAddress);
    if (!rateLimitResult.allowed) {
      return {
        error: 'Too many attempts. Please try again later.',
        data: null,
        rateLimited: true,
        retryAfter: rateLimitResult.retryAfter,
      };
    }

    const config = await getWebAuthnConfig();

    const challenge = await getAndClearChallengeCookie();
    if (!challenge) {
      return { error: 'Challenge expired. Please try again.', data: null };
    }

    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: data.credential.id },
      include: { user: { select: { id: true, username: true } } },
    });

    if (!storedCredential) {
      await recordLoginAttempt(null, ipAddress, false);
      return { error: 'Passkey not recognized.', data: null };
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: data.credential,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: config.requireUserVerification,
        credential: {
          id: storedCredential.credentialId,
          publicKey: Buffer.from(storedCredential.publicKey, 'base64url'),
          counter: Number(storedCredential.counter),
          transports: splitTransports(storedCredential.transports),
        },
      });
    } catch {
      await recordLoginAttempt(
        storedCredential.user.username,
        ipAddress,
        false,
      );
      return { error: 'Authentication failed.', data: null };
    }

    if (!verification.verified) {
      await recordLoginAttempt(
        storedCredential.user.username,
        ipAddress,
        false,
      );
      return { error: 'Authentication failed.', data: null };
    }

    await prisma.webAuthnCredential.update({
      where: { id: storedCredential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    await recordLoginAttempt(storedCredential.user.username, ipAddress, true);

    // The delete-then-set pair, variant two. See spike S2.
    await createSessionCookie(storedCredential.user.id);

    void addEvent(
      'User Login',
      `User ${storedCredential.user.username} logged in`,
    );

    return { error: null, data: { success: true } };
  });
