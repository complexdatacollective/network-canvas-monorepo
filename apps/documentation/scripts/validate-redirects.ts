#!/usr/bin/env tsx
/**
 * Validates the redirect rules in netlify.toml
 * Catches common issues before deployment:
 * - Express-style path parameters where Netlify needs splats
 * - Duplicate redirect rules
 * - Catch-all rules that should be at the end
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type NetlifyRedirect = {
  from: string;
  to: string;
  status: number;
  force?: boolean;
};

type ValidationIssue = {
  severity: 'error' | 'warning';
  file: string;
  rule: string;
  message: string;
};

const issues: ValidationIssue[] = [];

function parseNetlifyToml(content: string): NetlifyRedirect[] {
  const redirects: NetlifyRedirect[] = [];
  const lines = content.split('\n');
  let currentRedirect: Partial<NetlifyRedirect> = {};

  // A block with no `from` or `to` is not a redirect. Netlify's default
  // status, 301, applies when a block names none.
  const completeRedirect = (
    partial: Partial<NetlifyRedirect>,
  ): NetlifyRedirect | null =>
    partial.from && partial.to
      ? {
          ...partial,
          from: partial.from,
          to: partial.to,
          status: partial.status ?? 301,
        }
      : null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '[[redirects]]') {
      const completed = completeRedirect(currentRedirect);
      if (completed) redirects.push(completed);
      currentRedirect = {};
    } else if (trimmed.startsWith('from = ')) {
      currentRedirect.from = trimmed.match(/from = "(.+)"/)?.[1] || '';
    } else if (trimmed.startsWith('to = ')) {
      currentRedirect.to = trimmed.match(/to = "(.+)"/)?.[1] || '';
    } else if (trimmed.startsWith('status = ')) {
      currentRedirect.status = Number.parseInt(
        trimmed.match(/status = (\d+)/)?.[1] || '301',
        10,
      );
    } else if (trimmed.startsWith('force = ')) {
      currentRedirect.force = trimmed.includes('true');
    }
  }

  // Add last redirect if exists
  const completed = completeRedirect(currentRedirect);
  if (completed) redirects.push(completed);

  return redirects;
}

function validateNetlifyRedirects(redirects: NetlifyRedirect[]): void {
  let foundCatchAll = false;
  let catchAllIndex = -1;

  for (let i = 0; i < redirects.length; i++) {
    const redirect = redirects[i];
    if (!redirect) continue;

    // Check for invalid path parameter syntax (should use splat)
    if (redirect.from.includes('/:path') && !redirect.to.includes(':path')) {
      issues.push({
        severity: 'error',
        file: 'netlify.toml',
        rule: `${redirect.from} => ${redirect.to}`,
        message:
          'Invalid syntax: Netlify requires /* and :splat for wildcard paths, not /:path. Use \'from = "/*"\' and \'to = "/prefix/:splat"\'',
      });
    }

    // Check if using :path without matching :splat in destination
    if (redirect.from.includes('/:path') && redirect.to.includes('/:path')) {
      issues.push({
        severity: 'warning',
        file: 'netlify.toml',
        rule: `${redirect.from} => ${redirect.to}`,
        message:
          'Potential issue: Netlify uses :splat instead of :path for capturing multi-segment paths. Consider using /* and :splat',
      });
    }

    // Detect catch-all rules
    if (redirect.from === '/*' || redirect.from.match(/^\/:\w+\*?$/)) {
      if (foundCatchAll) {
        issues.push({
          severity: 'warning',
          file: 'netlify.toml',
          rule: `${redirect.from} => ${redirect.to}`,
          message:
            'Multiple catch-all rules found. Only the first one will match.',
        });
      }
      foundCatchAll = true;
      catchAllIndex = i;
    }

    // Check for rules after catch-all
    if (foundCatchAll && catchAllIndex >= 0 && i > catchAllIndex) {
      issues.push({
        severity: 'error',
        file: 'netlify.toml',
        rule: `${redirect.from} => ${redirect.to}`,
        message:
          'Rule will never match: specific rules must come BEFORE catch-all rules in Netlify (rules are processed top-to-bottom)',
      });
    }

    // Warn about force flag on catch-all
    if (foundCatchAll && redirect.force && i === catchAllIndex) {
      issues.push({
        severity: 'warning',
        file: 'netlify.toml',
        rule: `${redirect.from} => ${redirect.to}`,
        message: 'force = true on catch-all rule may cause unexpected behavior',
      });
    }
  }

  // Check for duplicate from paths
  const fromPaths = redirects.map((r) => r.from);
  const duplicates = fromPaths.filter(
    (path, index) => fromPaths.indexOf(path) !== index,
  );
  if (duplicates.length > 0) {
    for (const dup of new Set(duplicates)) {
      issues.push({
        severity: 'error',
        file: 'netlify.toml',
        rule: dup,
        message: `Duplicate redirect rule: ${dup} appears multiple times`,
      });
    }
  }
}

function main() {
  const docsDir = join(__dirname, '..');

  try {
    // Read and parse netlify.toml
    const netlifyContent = readFileSync(join(docsDir, 'netlify.toml'), 'utf-8');
    const netlifyRedirects = parseNetlifyToml(netlifyContent);
    console.log(
      `✓ Found ${netlifyRedirects.length} redirects in netlify.toml\n`,
    );

    validateNetlifyRedirects(netlifyRedirects);

    // Report issues
    if (issues.length === 0) {
      console.log('✅ netlify.toml redirects are valid!\n');
      process.exit(0);
    }

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    if (errors.length > 0) {
      console.error('❌ Found errors in netlify.toml redirects:\n');
      for (const error of errors) {
        console.error(`  [${error.file}] ${error.rule}`);
        console.error(`    ${error.message}\n`);
      }
    }

    if (warnings.length > 0) {
      console.warn('⚠️  Found warnings in netlify.toml redirects:\n');
      for (const warning of warnings) {
        console.warn(`  [${warning.file}] ${warning.rule}`);
        console.warn(`    ${warning.message}\n`);
      }
    }

    console.log(
      `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s)`,
    );

    // Exit with error code if there are errors
    process.exit(errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Failed to validate redirects:', error);
    process.exit(1);
  }
}

main();
