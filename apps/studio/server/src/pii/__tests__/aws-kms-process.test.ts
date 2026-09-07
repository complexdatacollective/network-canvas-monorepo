import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('KMS native SDK environment isolation', () => {
  it('signs only the intended provider request without metadata discovery or ambient user-agent and trace headers', () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./fixtures/kms-runtime-process.ts', import.meta.url),
        ),
      ],
      {
        env: {
          NODE_ENV: 'test',
          AWS_CONFIG_FILE: '/dev/null',
          AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
          AWS_DEFAULTS_MODE: 'auto',
          AWS_SDK_UA_APP_ID: 'ambient-canary-app-id',
          AWS_EXECUTION_ENV: 'ambient-canary-execution-environment',
          AWS_LAMBDA_FUNCTION_NAME: 'synthetic-function-fixture',
          _X_AMZN_TRACE_ID: 'ambient-canary-trace',
          AWS_ENDPOINT_URL: 'http://ambient-canary.example.test',
          AWS_ENDPOINT_URL_KMS: 'http://ambient-canary.example.test',
          AWS_ACCESS_KEY_ID: 'AKIA1111111111111111',
          AWS_SECRET_ACCESS_KEY: 'ambient-canary-other-principal',
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report: unknown = JSON.parse(result.stdout);
    // A signed native provider request is the positive control: a loader that
    // failed before doing any work cannot make the no-egress assertions pass.
    expect(report, JSON.stringify(report)).toEqual({
      metadataRequests: [],
      providerRequests: [
        {
          host: 'kms.us-east-1.amazonaws.com',
          signedByFixture: true,
          ambientHeaderNames: [],
        },
      ],
      providerReceived: 1,
      outcome: 'KeyConfigurationError',
    });
  });
});
