import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('the interview analytics catalogue', () => {
  it('loads under Node’s own module loader, as the api process runs it', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const { InterviewAnalyticsEvents } = await import('@codaco/interview/analytics-events'); process.stdout.write(String(Object.keys(InterviewAnalyticsEvents).length));",
      ],
      { cwd: fileURLToPath(new URL('../../..', import.meta.url)) },
    );
    expect(Number(output.toString())).toBeGreaterThan(0);
  });
});
