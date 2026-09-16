// The hostname the PostHog relay is reached at.
//
// Read from `@codaco/shared-consts` rather than repeated, for the same reason
// the sink's port list is: a lane that mapped the wrong name would send its
// events to the real relay and observe nothing, and the mistake would look
// exactly like a deployment that sent nothing.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

export function relayHost() {
  const source = readFileSync(
    join(repoRoot, 'packages/shared-consts/src/posthog.ts'),
    'utf8',
  );
  const url = /POSTHOG_HOST = '([^']+)'/.exec(source)?.[1];
  if (!url)
    throw new Error(
      'could not read POSTHOG_HOST from @codaco/shared-consts — a lane cannot map a relay it cannot name',
    );
  return new URL(url).hostname;
}
