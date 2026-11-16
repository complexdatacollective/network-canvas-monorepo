import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { test } from 'vitest';

import { getJob, getStep, readWorkflow } from '../ci/workflow-model.mjs';

test('release credential canary dry-runs every cross-repository push', () => {
  const workflow = readWorkflow('release-credential-canary.yml');
  const job = getJob(workflow, 'cross-repo-write');
  const script = getStep(job, {
    name: 'Verify the release token can push every mirror',
  }).run;

  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(
    [...script.matchAll(/'complexdatacollective\/([^']+):([^']+)'/g)].map(
      ([, repository, branch]) => `${repository}:${branch}`,
    ),
    ['Fresco:main', 'Architect:master', 'Interviewer:master'],
  );
  assert.match(
    script,
    /repos\/\$\{repository\}\/rules\/branches\/\$\{branch\}/,
  );
  assert.match(script, /jq 'length'/);
  assert.match(
    script,
    /effective branch rules; the canary cannot prove the release push is allowed/,
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
