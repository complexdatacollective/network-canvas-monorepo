/**
 * Build step: opts every exported HTML page out of the CDN's Email Address
 * Obfuscation. See `lib/protectEmailAddresses.ts` for why this is needed —
 * without it the rewrite inserts markup React did not render and hydration
 * fails outright on the affected pages.
 *
 * Runs over `out/` after `next build`, and fails the build if any email-shaped
 * text is left unprotected, so a new address in prose or a code block cannot
 * reintroduce the bug.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';

import {
  findUnprotectedEmailText,
  protectEmailAddresses,
} from '../lib/protectEmailAddresses.ts';

const OUT_DIR = join(import.meta.dirname, '..', 'out');

let pagesChanged = 0;
let runsProtected = 0;

for await (const relativePath of glob('**/*.html', { cwd: OUT_DIR })) {
  const file = join(OUT_DIR, relativePath);
  const original = await readFile(file, 'utf8');
  const { html, protectedRuns } = protectEmailAddresses(original);

  // Checked on every page, not only the ones that changed: a page whose
  // addresses this pass somehow could not wrap is exactly the page that would
  // break, and it has `protectedRuns === 0` like an address-free one.
  const leftOver = findUnprotectedEmailText(html);
  if (leftOver.length > 0) {
    throw new Error(
      `${relativePath}: email-shaped text is still exposed to the CDN rewrite after protection: ${leftOver.join(', ')}`,
    );
  }

  if (protectedRuns === 0) continue;

  await writeFile(file, html);
  pagesChanged += 1;
  runsProtected += protectedRuns;
}

console.log(
  `email_off: protected ${runsProtected} text run(s) across ${pagesChanged} page(s) in out/`,
);
