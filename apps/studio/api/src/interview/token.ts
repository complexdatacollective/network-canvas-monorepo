import { createHash, randomBytes } from 'node:crypto';

import { Option, Redacted } from 'effect';

import { PRESENTED_TOKEN_SECRET_LENGTH } from '@codaco/studio-contract/schema/ids';

const PRESENTED_TOKEN = new RegExp(
  `^(.+)\\.([A-Za-z0-9_-]{${PRESENTED_TOKEN_SECRET_LENGTH}})$`,
);

export type PresentedToken = {
  readonly teamId: string;
  readonly secretHash: Buffer;
};

const hashSecret = (secret: string): Buffer =>
  createHash('sha256').update(secret).digest();

export const parsePresentedToken = (
  token: Redacted.Redacted,
): Option.Option<PresentedToken> => {
  const match = PRESENTED_TOKEN.exec(Redacted.value(token));
  const teamId = match?.[1];
  const secret = match?.[2];
  if (teamId === undefined || secret === undefined) return Option.none();
  return Option.some({ teamId, secretHash: hashSecret(secret) });
};

export const mintSessionToken = (
  teamId: string,
): {
  readonly token: Redacted.Redacted;
  readonly secretHash: Buffer;
} => {
  const secret = randomBytes(32).toString('base64url');
  return {
    token: Redacted.make(`${teamId}.${secret}`),
    secretHash: hashSecret(secret),
  };
};
