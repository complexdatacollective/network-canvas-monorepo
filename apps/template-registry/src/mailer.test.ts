import pg from 'pg';
import { expect, it, vi } from 'vitest';

import { validateEmailAddress } from '@codaco/studio-sync/email-sender';

import { createRegistryMailer } from './mailer.ts';

it.each(['A'.repeat(240), '\\'.repeat(120)])(
  'rejects an oversized formatted Postmark sender before database or delivery work',
  async (name) => {
    const value = `"${name.replace(/["\\]/g, '\\$&')}" <from@example.test>`;
    expect(value.length).toBeGreaterThan(255);
    const from = validateEmailAddress(value);
    const pool = new pg.Pool({ host: '127.0.0.1', port: 1, max: 1 });
    const query = vi.spyOn(pool, 'query');
    try {
      const smtp = createRegistryMailer(
        { kind: 'smtp', url: 'smtp://127.0.0.1:1', from },
        pool,
        100,
      );
      smtp.close();
      expect(() =>
        createRegistryMailer(
          {
            kind: 'postmark',
            serverToken: 'synthetic-token',
            messageStream: 'outbound',
            from,
          },
          pool,
          100,
        ),
      ).toThrow('EMAIL_DELIVERY_PERMANENT');
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
      await pool.end();
    }
  },
);

it('accepts the exact Postmark formatted sender boundary and owns shutdown', async () => {
  const value = `"${'A'.repeat(233)}" <from@example.test>`;
  expect(value.length).toBe(255);
  const pool = new pg.Pool({ host: '127.0.0.1', port: 1, max: 1 });
  try {
    const mailer = createRegistryMailer(
      {
        kind: 'postmark',
        serverToken: 'synthetic-token',
        messageStream: 'outbound',
        from: validateEmailAddress(value),
      },
      pool,
      100,
    );
    mailer.close();
  } finally {
    await pool.end();
  }
});
