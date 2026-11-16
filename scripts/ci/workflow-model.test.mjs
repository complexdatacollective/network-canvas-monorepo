import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, test } from 'vitest';

import { getJob, getStep, raw, readActionsYaml } from './workflow-model.mjs';

const directory = mkdtempSync(join(tmpdir(), 'workflow-model-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function readFixture(source) {
  const file = join(directory, `${Math.random().toString(36).slice(2)}.yml`);
  writeFileSync(file, source);
  return readActionsYaml(pathToFileURL(file));
}

// GitHub substitutes `${{ }}` before the shell sees the script, comment lines
// included, and a substituted newline ends the comment. A guard that a script
// never interpolates a value has to see the comment.
test('a step read raw keeps the expression a comment interpolates', () => {
  const workflow = readFixture(`
on: workflow_dispatch
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Validate
        env:
          APP: \${{ inputs.app }}
        run: |
          # app is \${{ inputs.app }}
          echo "$APP"
      - name: Script
        uses: actions/github-script@v7
        with:
          script: |
            // key: \${{ secrets.TOKEN }}
            core.info('done');
`);
  const job = getJob(workflow, 'verify');
  const run = getStep(job, { name: 'Validate' });
  const script = getStep(job, { name: 'Script' });
  const interpolates = /\$\{\{\s*(?:inputs|secrets)\./;

  assert.doesNotMatch(run.run, interpolates);
  assert.doesNotMatch(script.with.script, interpolates);

  assert.match(raw(run).run, interpolates);
  assert.match(raw(script).with.script, interpolates);
  assert.match(JSON.stringify(raw(job)), /# app is \$\{\{ inputs\.app \}\}/);
  assert.match(
    JSON.stringify(raw(workflow)),
    /\/\/ key: \$\{\{ secrets\.TOKEN \}\}/,
  );
});

test('raw() refuses an object that did not come from readActionsYaml', () => {
  assert.throws(() => raw({ run: 'echo' }), /from readActionsYaml/);
});
