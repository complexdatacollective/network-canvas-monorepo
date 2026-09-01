import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { TenantDb } from '@codaco/studio-sync/tenant';

import type { SessionPrincipal } from '../../auth/service.ts';
import { createAuditedProtocol } from '../commands.ts';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'protocol-command-owner',
  email: 'protocol-command-owner@example.com',
  emailVerified: true,
  name: 'Protocol Command Owner',
  sessionId: 'protocol-command-owner-session',
};

describe('audited protocol commands', () => {
  it('rejects a whitespace-only protocol name before opening a transaction', () => {
    let transactionCount = 0;
    const tenantDb: TenantDb = {
      teamId: 'protocol-command-team',
      query: () => Promise.reject(new Error('unexpected query')),
      transaction: () => {
        transactionCount += 1;
        return Promise.reject(new Error('unexpected transaction'));
      },
    };

    expect(() =>
      createAuditedProtocol(
        {
          tenantDb,
          principal: PRINCIPAL,
          requestId: randomUUID(),
        },
        {
          name: '   ',
          protocolId: randomUUID(),
          draftId: randomUUID(),
        },
      ),
    ).toThrow('Protocol name must contain a non-whitespace character');
    expect(transactionCount).toBe(0);
  });
});
