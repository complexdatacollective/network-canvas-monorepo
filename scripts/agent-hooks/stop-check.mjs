#!/usr/bin/env node
// Stop / SubagentStop hook, also `pnpm agent:check` (--manual): typechecks the
// packages changed on this branch plus their dependents through turbo (cached,
// so unchanged packages cost nothing). A turn that changed nothing since the
// last clean run is skipped outright. Manual mode additionally runs knip and
// lints and format-checks the changed files. When something fails the hook
// returns a block decision so the agent fixes it before finishing; repeated
// identical failures let the agent stop so it can report instead of looping.
import { statSync } from 'node:fs';
import path from 'node:path';

import {
  binPath,
  changeFingerprint,
  changedFiles,
  emit,
  isFormattable,
  isKnipRelevant,
  isLintable,
  packagesForFiles,
  parseTypecheckOutput,
  previousPackageNames,
  readHookInput,
  readState,
  resolveRepoRoot,
  run,
  shouldSkip,
  signature,
  truncateLines,
  updateState,
} from './lib.mjs';

const manual = process.argv.includes('--manual');
const input = manual ? {} : readHookInput();
const root = resolveRepoRoot(input);
const changed = changedFiles(root);

if (changed.length === 0) {
  if (manual) console.log('agent:check: no changes relative to origin/main.');
  process.exit(0);
}

const relative = (file) => path.relative(root, file);
const problems = [];

const fingerprint = changeFingerprint(root, changed);
const state = readState(root);
if (!manual && state.lastClean === fingerprint) process.exit(0);

// `checked` stays false when the typecheck could not run at all, so an
// unchecked state is never recorded as clean.
let checked = false;
const mapped = packagesForFiles(changed, root);
const all = mapped.all;
// A renamed or removed workspace package is still reachable by its old name.
const seeds = [
  ...new Set([...mapped.seeds, ...previousPackageNames(root, changed)]),
].sort((a, b) => a.localeCompare(b));
const turbo = binPath(root, 'turbo');
if (!all && seeds.length === 0) {
  checked = true;
} else if (!turbo) {
  problems.push(
    'Typecheck could not run: node_modules/.bin/turbo is missing (dependencies not installed).',
  );
} else {
  const args = ['run', 'typecheck', '--continue', '--output-logs=errors-only'];
  if (!all) for (const name of seeds) args.push(`--filter=...${name}`);
  const result = run(turbo, args, {
    cwd: root,
    env: {
      TURBO_UI: 'stream',
      TURBO_TELEMETRY_DISABLED: '1',
      TURBO_NO_UPDATE_NOTIFIER: '1',
    },
    timeoutMs: 280_000,
  });
  if (result.error) {
    problems.push(`Typecheck did not finish: ${result.error.message}`);
  } else {
    checked = true;
    if (result.status !== 0) {
      const { errors, failed } = parseTypecheckOutput(
        `${result.stdout}\n${result.stderr}`,
      );
      const detail =
        errors.length > 0
          ? errors.join('\n')
          : `${result.stdout}\n${result.stderr}`.trim();
      problems.push(
        `Typecheck failed${failed.length > 0 ? ` (${failed.join('; ')})` : ''}:\n${truncateLines(detail, 40)}`,
      );
    }
  }
}

// knip is pre-push work (see .husky/pre-push); manual mode runs it on demand.
const knip = binPath(root, 'knip');
if (manual && knip && changed.some((file) => isKnipRelevant(relative(file)))) {
  const result = run(knip, ['--no-progress'], {
    cwd: root,
    env: { SKIP_ENV_VALIDATION: 'true' },
    timeoutMs: 120_000,
  });
  if (result.error) {
    problems.push(`knip did not finish: ${result.error.message}`);
  } else if (result.status !== 0) {
    problems.push(
      `knip found issues:\n${truncateLines(`${result.stdout}\n${result.stderr}`.trim(), 40)}`,
    );
  }
}

if (manual) {
  const present = changed.filter(
    (file) => !shouldSkip(file, root) && exists(file),
  );
  const oxfmt = binPath(root, 'oxfmt');
  const oxlint = binPath(root, 'oxlint');
  const formattable = present.filter(isFormattable).map(relative);
  if (oxfmt && formattable.length > 0) {
    const result = run(
      oxfmt,
      ['--check', '--no-error-on-unmatched-pattern', ...formattable],
      { cwd: root, timeoutMs: 60_000 },
    );
    if (result.status !== 0) {
      problems.push(
        `Formatting differs (run oxfmt on these files):\n${truncateLines(`${result.stdout}\n${result.stderr}`.trim(), 30)}`,
      );
    }
  }
  const lintable = present.filter(isLintable).map(relative);
  if (oxlint && lintable.length > 0) {
    const result = run(oxlint, ['--quiet', '--format=agent', ...lintable], {
      cwd: root,
      timeoutMs: 120_000,
    });
    if (result.status !== 0) {
      problems.push(
        `oxlint errors:\n${truncateLines(`${result.stdout}\n${result.stderr}`.trim(), 40)}`,
      );
    }
  }
}

function exists(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

const key = input.agent_id ?? input.agentId ?? 'main';

if (problems.length === 0) {
  updateState(root, (current) => {
    delete current[key];
    if (!manual && checked) current.lastClean = fingerprint;
  });
  if (manual)
    console.log(
      `agent:check: OK (${changed.length} changed files, packages: ${all ? 'all' : seeds.join(', ') || 'none'}).`,
    );
  process.exit(0);
}

const report = problems.join('\n\n');
if (manual) {
  console.log(report);
  process.exit(1);
}

const sig = signature(report);
let previous;
let attempts;
updateState(root, (current) => {
  previous = current[key];
  attempts = (previous?.attempts ?? 0) + 1;
  current[key] = { signature: sig, attempts };
  delete current.lastClean;
});

const madeProgress = previous?.signature !== sig;
const block = !input.stop_hook_active || (madeProgress && attempts <= 4);

if (block) {
  emit({
    decision: 'block',
    reason:
      'Automatic pre-stop check found problems in the files changed on this branch. ' +
      'Fix them before finishing; do not run whole-tree lint/typecheck, this check already ' +
      'ran the scoped versions.\n\n' +
      report,
  });
} else {
  emit({
    systemMessage: `Agent hooks: problems remain after ${attempts} attempts; letting the agent stop so it can report.\n${report}`,
  });
}
