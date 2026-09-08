#!/usr/bin/env node
// PostToolUse hook for file edits: formats and lint-fixes the edited file(s)
// and tells the agent what changed on disk and which lint errors remain.
// Shell commands that write files (redirects, sed -i, generators) name no
// path in the event, so for those the hook formats the uncommitted files
// modified since the previous hook run.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  binPath,
  changedFiles,
  emit,
  extractEditedFiles,
  isFormattable,
  isLintable,
  isUnderRepo,
  modifiedSince,
  readHookInput,
  readState,
  resolveRepoRoot,
  run,
  shouldSkip,
  takeCommandStart,
  truncateLines,
  writeState,
} from './lib.mjs';

const input = readHookInput();
const root = resolveRepoRoot(input);
const toolName = input.tool_name ?? input.toolName ?? '';
const startedAt = Date.now();

const eligible = (file) =>
  isUnderRepo(file, root) &&
  !shouldSkip(file, root) &&
  existsSync(file) &&
  isFormattable(file);

let files = extractEditedFiles(input, root).filter(eligible);
const state = readState(root);
if (
  files.length === 0 &&
  /^(Bash|shell|exec_command|local_shell)$/i.test(toolName)
) {
  // No explicit path: fall back to what changed on disk since the command
  // started (recorded by the pre-command hook).
  const since = takeCommandStart(
    state,
    input.tool_use_id ?? input.toolUseId,
    startedAt,
  );
  files = modifiedSince(changedFiles(root).filter(eligible), since);
}
state.lastPostEdit = startedAt;
writeState(root, state);
if (files.length === 0) process.exit(0);

const oxfmt = binPath(root, 'oxfmt');
const oxlint = binPath(root, 'oxlint');
// Dependencies not installed yet (fresh worktree before setup): stay silent.
if (!oxfmt || !oxlint) process.exit(0);

const relative = (file) => path.relative(root, file);
const before = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

const format = run(
  oxfmt,
  ['--no-error-on-unmatched-pattern', ...files.map(relative)],
  { cwd: root, timeoutMs: 30_000 },
);

const lintable = files.filter(isLintable);
let lintReport = '';
if (lintable.length > 0) {
  const lint = run(
    oxlint,
    ['--fix', '--quiet', '--format=agent', ...lintable.map(relative)],
    { cwd: root, timeoutMs: 45_000 },
  );
  lintReport = lint.error
    ? `oxlint did not finish: ${lint.error.message}`
    : lint.stdout.trim();
}

const reformatted = files
  .filter((file) => readFileSync(file, 'utf8') !== before.get(file))
  .map(relative);

const parts = [];
if (reformatted.length > 0) {
  parts.push(
    `Auto-formatted on disk (oxfmt + oxlint --fix): ${reformatted.join(', ')}. ` +
      'Re-read before an edit that depends on exact surrounding text.',
  );
}
if (format.status !== 0 && format.stderr.trim()) {
  parts.push(
    `oxfmt could not format:\n${truncateLines(format.stderr.trim(), 15)}`,
  );
}
if (lintReport) {
  parts.push(
    `oxlint errors remain (fix them before you finish):\n${truncateLines(lintReport, 30)}`,
  );
}
if (parts.length === 0) process.exit(0);

emit({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: parts.join('\n\n'),
  },
});
