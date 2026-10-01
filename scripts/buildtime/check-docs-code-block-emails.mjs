#!/usr/bin/env node
/**
 * Refuses an email-shaped literal inside a fenced code block in documentation
 * content.
 *
 * Why this is a build error rather than a style preference. The documentation
 * site is a static export served through Cloudflare, which has **Email Address
 * Obfuscation** enabled. That feature rewrites email-shaped text in the HTML as
 * it is served, replacing it with
 *
 *     <a href="/cdn-cgi/l/email-protection" class="__cf_email__"
 *        data-cfemail="…">[email&#160;protected]</a>
 *
 * The exported HTML is what React hydrates against, so a rewritten text node no
 * longer matches what the client renders and React throws
 * `Minified React error #418` — "server rendered text didn't match the client" —
 * and discards the page's tree. That is issue #2005: on
 * `/en/collect-data/fresco/advanced` the line `ACME_EMAIL=you@example.com`
 * inside a bash block was rewritten this way and broke hydration for roughly a
 * third of that page's visitors (8 exceptions across 23 viewers).
 *
 * Prose is deliberately not checked. A real contact address like
 * `info@networkcanvas.com` is editorial content that belongs in the page, and
 * the fix for those is to turn Email Address Obfuscation off for the
 * documentation hostname — not to delete the address. An address inside a code
 * block is different: it is always an example, a placeholder reads better
 * anyway, and avoiding it costs nothing.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_ROOT = fileURLToPath(
  new URL('../../apps/documentation/docs/', import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Deliberately loose: it only has to match what Cloudflare's own rewriter
// matches, which is anything that reads as an address.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function findCodeBlockEmails(source) {
  const found = [];
  let inFence = false;
  let fence = '';

  source.split('\n').forEach((line, index) => {
    const opening = /^\s*(`{3,}|~{3,})/.exec(line);

    if (!inFence && opening) {
      inFence = true;
      fence = opening[1][0].repeat(3);
      return;
    }

    if (inFence && opening && opening[1].startsWith(fence)) {
      inFence = false;
      return;
    }

    if (!inFence) return;

    const match = EMAIL.exec(line);
    if (match) {
      found.push({ line: index + 1, text: match[0], source: line.trim() });
    }
  });

  return found;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (/\.mdx?$/.test(entry.name)) {
      yield path;
    }
  }
}

async function main() {
  const failures = [];

  for await (const file of walk(DOCS_ROOT)) {
    for (const hit of findCodeBlockEmails(readFileSync(file, 'utf8'))) {
      failures.push({ file: relative(REPO_ROOT, file), ...hit });
    }
  }

  if (failures.length === 0) {
    console.log('No email-shaped literals in documentation code blocks.');
    return;
  }

  for (const f of failures) {
    console.error(
      `::error file=${f.file},line=${f.line}::\`${f.text}\` is email-shaped. ` +
        'Cloudflare Email Address Obfuscation rewrites it in the served HTML, ' +
        'which breaks React hydration (#2005). Use a placeholder such as ' +
        'CHANGE_ME instead.',
    );
    console.error(`  ${f.file}:${f.line}  ${f.source}`);
  }
  console.error(
    `\n${failures.length} email-shaped literal(s) in documentation code blocks.`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
