import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  createOperationalLogger,
  logOperational,
  requestContext,
} from '../logger.ts';
import { createObservability } from '../runtime.ts';

describe('operational output allowlists', () => {
  it('has no raw runtime console or warning bypass outside the explicit development tools', async () => {
    const source = new URL('../../', import.meta.url);
    const files = await readdir(source, { recursive: true });
    const violations: string[] = [];
    // These existing development-only outputs deliberately carry working
    // synthetic credentials. Their own env/CLI gates have dedicated tests.
    const developmentOutputs = new Set(['auth/email.ts', 'db/seed.ts']);
    for (const file of files) {
      if (
        !file.endsWith('.ts') ||
        file.includes('__tests__/') ||
        developmentOutputs.has(file)
      )
        continue;
      const text = await readFile(new URL(file, source), 'utf8');
      if (
        /\b(?:console\.(?:log|warn|error|info|debug)\s*\(|process\.emitWarning\s*\()/u.test(
          text,
        )
      )
        violations.push(file);
    }
    expect(violations).toEqual([]);
  });
  it('serializes only declared request and correlation fields', () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createOperationalLogger({
      write(line) {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    });
    const secret = 'participant@example.test-secret-token-protocol-answer';
    const correlation = {
      requestId: randomUUID(),
      teamId: 'authorized-team',
      email: secret,
      actorId: secret,
      cause: new Error(secret),
    };
    logger.request({
      ...correlation,
      route: '/rpc/studies/create',
      method: 'POST',
      status: 200,
      durationMs: 1.2345,
    });
    requestContext.run({ ...correlation, logger }, () =>
      logOperational('STUDIO_AUDIT_APPEND_FAILED'),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      level: 30,
      time: expect.any(String),
      event: 'http_request',
      request_id: correlation.requestId,
      team_id: 'authorized-team',
      route: '/rpc/studies/create',
      method: 'POST',
      status: 200,
      duration_ms: 1.235,
    });
    expect(lines[1]).toEqual({
      level: 50,
      time: expect.any(String),
      event: 'operational',
      code: 'STUDIO_AUDIT_APPEND_FAILED',
      request_id: correlation.requestId,
      team_id: 'authorized-team',
    });
    expect(JSON.stringify(lines)).not.toContain(secret);
  });

  it('drops malformed correlation values and survives a failing output sink', () => {
    const write = vi.fn();
    const logger = createOperationalLogger({ write });
    logger.diagnostic('STUDIO_DATABASE_IDLE_ERROR', {
      requestId: 'Bearer secret',
      teamId: 'participant@example.test\n',
    });
    expect(JSON.parse(write.mock.calls[0]![0])).toEqual({
      level: 50,
      time: expect.any(String),
      event: 'operational',
      code: 'STUDIO_DATABASE_IDLE_ERROR',
    });
    const broken = createOperationalLogger({
      write() {
        throw new Error('sink failed');
      },
    });
    expect(() => broken.diagnostic('STUDIO_AUDIT_APPEND_FAILED')).not.toThrow();
  });

  it('records each shared dispatcher event once and keeps uncertain separate from retries and failures', async () => {
    const runtime = createObservability({});
    await runtime.metrics.observer({
      queue: 'team_invitation_deliveries',
      kind: 'dispatch',
      durationMs: 250,
      claimed: 4,
      completed: 1,
      retried: 1,
      failed: 1,
      suppressed: 0,
      uncertain: 1,
      leaseLost: 0,
    });
    await runtime.metrics.observer({
      queue: 'team_invitation_deliveries',
      kind: 'heartbeat',
      outcome: 'error',
    });
    await runtime.metrics.observer({
      queue: 'team_invitation_deliveries',
      kind: 'worker_error',
    });
    const { body } = await runtime.metrics.scrape();
    for (const result of ['completed', 'retried', 'failed', 'uncertain'])
      expect(body).toContain(
        `studio_outbox_dispatch_results_total{queue="team_invitation_deliveries",result="${result}"} 1`,
      );
    expect(body).toContain(
      'studio_outbox_dispatch_duration_seconds_count{queue="team_invitation_deliveries"} 1',
    );
    expect(body).toContain(
      'studio_outbox_lease_renewals_total{queue="team_invitation_deliveries",outcome="error"} 1',
    );
    expect(body).toContain(
      'studio_outbox_errors_total{queue="team_invitation_deliveries",kind="worker_error"} 1',
    );
    expect(body).not.toMatch(
      /team_id|request_id|participant|actor_id|message_id/,
    );
    runtime.stop();
  });
});
