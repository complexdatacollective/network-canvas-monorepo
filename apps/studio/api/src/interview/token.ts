import { createHash, randomBytes } from 'node:crypto';

import { Option } from 'effect';

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
  token: string,
): Option.Option<PresentedToken> => {
  const match = PRESENTED_TOKEN.exec(token);
  const teamId = match?.[1];
  const secret = match?.[2];
  if (teamId === undefined || secret === undefined) return Option.none();
  return Option.some({ teamId, secretHash: hashSecret(secret) });
};

export const mintSessionToken = (
  teamId: string,
): { readonly token: string; readonly secretHash: Buffer } => {
  const secret = randomBytes(32).toString('base64url');
  return { token: `${teamId}.${secret}`, secretHash: hashSecret(secret) };
};
