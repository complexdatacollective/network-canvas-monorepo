import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { findCodeBlockEmails } from './check-docs-code-block-emails.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(scriptDir, 'check-docs-code-block-emails.mjs');
const REPO_ROOT = resolve(scriptDir, '..', '..');

test('an address inside a backtick-fenced block is reported', () => {
  // The exact line that broke /en/collect-data/fresco/advanced (#2005).
  const found = findCodeBlockEmails(
    '# intro\n\n```bash\nACME_EMAIL=you@example.com\n```\n',
  );

  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'you@example.com');
  assert.equal(found[0].line, 4);
});

test('an address inside a tilde-fenced block is reported', () => {
  // Both fence characters are valid markdown; a check that only knew about
  // backticks would miss half the ways this can be written.
  const found = findCodeBlockEmails('~~~\nSMTP_FROM=a@b.co\n~~~\n');

  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'a@b.co');
});

test('an address in prose is left alone', () => {
  // Real contact addresses are editorial content. The fix for those is the
  // Cloudflare setting, not deleting them from the page.
  const found = findCodeBlockEmails(
    'Contact [info@networkcanvas.com](mailto:info@networkcanvas.com) to ask.\n',
  );

  assert.deepEqual(found, []);
});

test('an address after a closed block is prose again', () => {
  // A fence tracker that never closed would swallow the rest of the file and
  // report prose addresses as code-block ones.
  const found = findCodeBlockEmails(
    '```bash\necho hi\n```\n\nEmail info@networkcanvas.com for help.\n',
  );

  assert.deepEqual(found, []);
});

test('several blocks in one file are all reported', () => {
  const found = findCodeBlockEmails(
    '```\na@b.co\n```\ntext\n```\nc@d.co\n```\n',
  );

  assert.deepEqual(
    found.map((f) => f.text),
    ['a@b.co', 'c@d.co'],
  );
});

test('the committed documentation passes the check', () => {
  // Exits 0 today, and 1 the moment someone reintroduces the pattern — the
  // behaviour CI depends on.
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT }),
  );
});
