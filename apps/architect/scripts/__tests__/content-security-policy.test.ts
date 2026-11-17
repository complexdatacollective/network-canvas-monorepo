import { describe, expect, it } from 'vitest';

import { PROTOCOL_REVIEW_SERVICE_URL } from '@codaco/protocol-review-worker/contract';

import { contentSecurityPolicy } from '../content-security-policy';

const connectSources = (policy: string) =>
  policy
    .split('; ')
    .find((directive) => directive.startsWith('connect-src '))
    ?.split(' ')
    .slice(1);

describe('content security policy', () => {
  // The service's origin is a literal in the policy (Node loads the Vite
  // config, which cannot import the contract), so this keeps the two in step.
  it('lets the app reach the protocol review service', () => {
    expect(connectSources(contentSecurityPolicy(undefined))).toContain(
      new URL(PROTOCOL_REVIEW_SERVICE_URL).origin,
    );
  });

  it('also lets a build pointed at another review service reach that one', () => {
    const sources = connectSources(
      contentSecurityPolicy('http://localhost:8787/'),
    );
    expect(sources).toContain('http://localhost:8787');
    expect(sources).toContain(new URL(PROTOCOL_REVIEW_SERVICE_URL).origin);
  });

  it('adds nothing for a build that does not set one', () => {
    expect(contentSecurityPolicy('')).toBe(contentSecurityPolicy(undefined));
  });

  it('changes no other directive', () => {
    const withOverride = contentSecurityPolicy('https://review.example');
    const without = contentSecurityPolicy(undefined);
    expect(
      withOverride.split('; ').filter((d) => !d.startsWith('connect-src ')),
    ).toEqual(without.split('; ').filter((d) => !d.startsWith('connect-src ')));
  });
});
