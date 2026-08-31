import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(
  REPO_ROOT,
  '.github',
  'workflows',
  'release-credential-canary.yml',
);

test('release credential canary dry-runs every cross-repository push', () => {
  const workflow = parse(readFileSync(WORKFLOW_PATH, 'utf8'));
  const job = workflow.jobs['cross-repo-write'];
  const script = job.steps[0].run;

  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(
    [...script.matchAll(/'complexdatacollective\/([^']+):([^']+)'/g)].map(
      ([, repository, branch]) => `${repository}:${branch}`,
    ),
    ['Fresco:main', 'Architect:master', 'Interviewer:master'],
  );

  const continuedScript = script.replace(/\\\n\s*/g, ' ');
  const pushCommands = continuedScript
    .split('\n')
    .filter((line) => /\bgit\b.*\bpush\b/.test(line));
  assert.equal(pushCommands.length, 1);
  assert.match(pushCommands[0], /\bpush\s+--dry-run\b/);

  const syntaxCheck = spawnSync('bash', ['-n'], {
    input: script,
    encoding: 'utf8',
  });
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
});
