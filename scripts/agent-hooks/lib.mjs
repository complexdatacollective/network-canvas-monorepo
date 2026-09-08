// Shared helpers for the agent hook scripts in this directory.
//
// The scripts are wired into Claude Code (.claude/settings.json) and Codex
// (.codex/hooks.json). Both harnesses run a hook as a subprocess with one JSON
// event on stdin and read a JSON verdict from stdout. Everything here is
// harness-agnostic: it reads whichever field names the event carries and
// reports paths relative to the repository root.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const FORMAT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
  '.jsonc',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.yaml',
  '.yml',
  '.toml',
  '.gql',
  '.graphql',
  '.vue',
  '.svelte',
  '.astro',
]);

const LINT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
  '.astro',
]);

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

const SKIP_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'out',
  '.next',
  '.git',
  'storybook-static',
  '.turbo',
  'coverage',
  '.generated',
]);

export function readHookInput() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function run(cmd, args, { cwd, env, timeoutMs } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

export function git(args, cwd) {
  const result = run('git', args, { cwd });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function resolveRepoRoot(input = {}, env = process.env) {
  const candidates = [
    env.CLAUDE_PROJECT_DIR,
    env.CODEX_PROJECT_DIR,
    input.cwd,
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const top = git(['rev-parse', '--show-toplevel'], candidate);
    if (top) return top;
  }
  return process.cwd();
}

// Codex's apply_patch tool carries the touched paths inside the patch text.
export function parseApplyPatchPaths(text) {
  const paths = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = /^\*\*\* (?:Update File|Add File|Move to): (.+)$/.exec(line);
    if (match) paths.push(match[1].trim());
  }
  return paths;
}

// Codex's apply_patch reports the touched files in its text response:
// "Success. Updated the following files:\nA added\nM modified\nD deleted".
export function parseApplyPatchResponse(text) {
  const paths = [];
  let listing = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (/Updated the following files:/.test(line)) {
      listing = true;
      continue;
    }
    if (!listing) continue;
    const match = /^([AM]) (.+)$/.exec(line);
    if (match) paths.push(match[2].trim());
    else if (!/^D .+$/.test(line)) listing = false;
  }
  return paths;
}

// Removes heredoc bodies and apply_patch blocks so text being written to a
// file is never mistaken for a command.
export function stripEmbeddedText(command) {
  const lines = command.split('\n');
  const kept = [];
  let terminator = null;
  let inPatch = false;
  for (const line of lines) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    if (inPatch) {
      if (line.trim() === '*** End Patch') inPatch = false;
      continue;
    }
    if (line.trim() === '*** Begin Patch') {
      inPatch = true;
      continue;
    }
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (heredoc) terminator = heredoc[2];
    kept.push(line);
  }
  return kept.join('\n');
}

// Returns absolute paths named by a file-editing tool call, whichever harness
// produced the event. Unknown shapes yield an empty list rather than a throw.
export function extractEditedFiles(input, root) {
  const toolInput = input.tool_input ?? input.toolInput ?? input.input ?? {};
  const found = new Set();
  const add = (candidate) => {
    if (typeof candidate === 'string' && candidate.trim()) {
      found.add(path.resolve(root, candidate.trim()));
    }
  };
  if (toolInput && typeof toolInput === 'object') {
    add(toolInput.file_path);
    add(toolInput.filePath);
    add(toolInput.notebook_path);
    add(toolInput.path);
    for (const key of ['edits', 'files', 'paths', 'changes']) {
      if (!Array.isArray(toolInput[key])) continue;
      for (const entry of toolInput[key]) {
        add(
          typeof entry === 'string' ? entry : (entry?.file_path ?? entry?.path),
        );
      }
    }
    for (const key of ['patch', 'input', 'command']) {
      const value = toolInput[key];
      if (typeof value === 'string' && value.includes('*** Begin Patch')) {
        for (const p of parseApplyPatchPaths(value)) add(p);
      }
    }
  }
  const response = input.tool_response ?? input.toolResponse ?? {};
  if (typeof response === 'string') {
    for (const p of parseApplyPatchResponse(response)) add(p);
  } else if (response && typeof response === 'object') {
    add(response.filePath);
    add(response.file_path);
    if (Array.isArray(response.changes)) {
      for (const entry of response.changes)
        add(entry?.path ?? entry?.file_path);
    }
  }
  return [...found];
}

export function isUnderRepo(file, root) {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function shouldSkip(file, root) {
  return path
    .relative(root, file)
    .split(path.sep)
    .some((segment) => SKIP_SEGMENTS.has(segment));
}

export function isFormattable(file) {
  return FORMAT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function isLintable(file) {
  return LINT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function binPath(root, name) {
  const candidate = path.join(root, 'node_modules', '.bin', name);
  return existsSync(candidate) ? candidate : null;
}

// Uncommitted paths from `git status --porcelain=v1 -z`: each record is
// "XY path\0", and a rename or copy record is followed by the original path
// as a second NUL-terminated field. Both sides are returned so the package
// a file moved out of is still checked.
export function parsePorcelainZ(output) {
  const files = [];
  const entries = output.split('\0');
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    files.push(entry.slice(3));
    if (
      code[0] === 'R' ||
      code[0] === 'C' ||
      code[1] === 'R' ||
      code[1] === 'C'
    ) {
      i += 1;
      if (entries[i]) files.push(entries[i]);
    }
  }
  return files;
}

// Everything that differs from origin/main: uncommitted work (staged, unstaged
// and untracked) plus commits on this branch. Paths are absolute; deleted and
// moved-away files are included so their package still gets checked.
export function changedFiles(root) {
  const files = new Set();
  const status = run(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root },
  );
  if (status.status === 0) {
    for (const rel of parsePorcelainZ(status.stdout)) files.add(rel);
  }
  const base =
    git(['merge-base', 'HEAD', 'origin/main'], root) ??
    git(['merge-base', 'HEAD', 'main'], root);
  if (base) {
    // --no-renames reports a rename as a delete plus an add, so both paths
    // appear rather than only the destination.
    const diff = git(
      ['diff', '--name-only', '--no-renames', base, 'HEAD'],
      root,
    );
    if (diff) for (const line of diff.split('\n')) if (line) files.add(line);
  }
  return [...files]
    .sort((a, b) => a.localeCompare(b))
    .map((rel) => path.join(root, rel));
}

// Files outside any workspace package that every package can depend on:
// shared configuration, and root TypeScript sources (the Vite plugins under
// scripts/ are compiled by the apps' node tsconfigs). tooling/typescript is a
// workspace package (@codaco/tsconfig), reached as an ordinary seed.
function isGlobalInput(rel) {
  if (
    [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'turbo.json',
      'tsconfig.json',
    ].includes(rel)
  ) {
    return true;
  }
  return TYPESCRIPT_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

function defaultReadPackage(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

// Finds the nearest workspace package manifest above `file`, or null when the
// file belongs to the repository root.
export function packageForFile(
  file,
  root,
  {
    readPackage = defaultReadPackage,
    cache = new Map(),
    isWorkspaceDir = defaultIsWorkspaceDir(root, readPackage),
  } = {},
) {
  let dir = path.dirname(file);
  while (dir !== root && isUnderRepo(dir, root)) {
    if (!cache.has(dir))
      cache.set(dir, readPackage(path.join(dir, 'package.json')));
    const pkg = cache.get(dir);
    if (pkg && isWorkspaceDir(dir)) return { dir, manifest: pkg };
    dir = path.dirname(dir);
  }
  return null;
}

// Nested manifests that are not workspace packages (packages/interview/e2e/
// package.json, for example) are climbed past: a turbo filter seeded from
// them matches nothing ("No package found").
const workspaceDirCache = new Map();
function defaultIsWorkspaceDir(root, readPackage) {
  return (dir) => {
    if (!workspaceDirCache.has(root)) {
      const dirs = new Set();
      for (const entry of workspacePackages(root, { readPackage }).values()) {
        dirs.add(entry.dir);
      }
      workspaceDirCache.set(root, dirs);
    }
    return workspaceDirCache.get(root).has(dir);
  };
}

// Maps changed files to workspace packages. `seeds` is every named package
// that contains a change (turbo filters seeded from them reach dependents
// even when the seed lacks the task itself); `packages` is the subset that
// defines `script` (by default `typecheck`). `all` is set when a file every
// package depends on changed.
export function packagesForFiles(
  files,
  root,
  {
    readPackage = defaultReadPackage,
    script = 'typecheck',
    isWorkspaceDir,
  } = {},
) {
  const seeds = new Set();
  const names = new Set();
  let all = false;
  const cache = new Map();
  const lookup = { readPackage, cache };
  if (isWorkspaceDir) lookup.isWorkspaceDir = isWorkspaceDir;
  for (const file of files) {
    const found = packageForFile(file, root, lookup);
    if (!found) {
      if (isGlobalInput(path.relative(root, file))) all = true;
      continue;
    }
    const { manifest } = found;
    if (!manifest.name) continue;
    seeds.add(manifest.name);
    if (manifest.scripts?.[script]) names.add(manifest.name);
  }
  const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b));
  return { packages: sorted(names), seeds: sorted(seeds), all };
}

// name -> { dir, manifest } for every workspace package, from the globs in
// pnpm-workspace.yaml (one directory level per glob segment).
// A changed package.json may have renamed or removed a workspace package.
// Consumers that still declare the old name are only reached through that
// name, so the base revision's name is returned for each changed manifest
// whose name differs from (or no longer exists in) the working tree.
export function previousPackageNames(root, files, { base } = {}) {
  const ref =
    base ??
    git(['merge-base', 'HEAD', 'origin/main'], root) ??
    git(['merge-base', 'HEAD', 'main'], root);
  if (!ref) return [];
  const names = new Set();
  for (const file of files) {
    const rel = path.relative(root, file);
    if (path.basename(rel) !== 'package.json' || rel === 'package.json')
      continue;
    const before = git(['show', `${ref}:${rel}`], root);
    if (!before) continue;
    let oldName;
    try {
      oldName = JSON.parse(before).name;
    } catch {
      continue;
    }
    if (!oldName) continue;
    let currentName;
    try {
      currentName = JSON.parse(readFileSync(file, 'utf8')).name;
    } catch {
      currentName = undefined;
    }
    if (currentName !== oldName) names.add(oldName);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function workspacePackages(
  root,
  { readPackage = defaultReadPackage } = {},
) {
  const map = new Map();
  let globs = [];
  try {
    const yaml = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const section = /^packages:\n((?:[ \t]+.*\n?)*)/m.exec(yaml)?.[1] ?? '';
    globs = [...section.matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)].map(
      (m) => m[1].trim(),
    );
  } catch {
    return map;
  }
  for (const glob of globs) {
    const parent = path.join(root, glob.replace(/\/\*$/, ''));
    if (!glob.endsWith('/*') || !existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(parent, entry.name);
      const manifest = readPackage(path.join(dir, 'package.json'));
      if (manifest?.name) map.set(manifest.name, { dir, manifest });
    }
  }
  return map;
}

// Is `dir` inside a workspace package (rather than the repository root)?
function isPackageDir(dir, root, options) {
  if (!isUnderRepo(dir, root)) return false;
  return packageForFile(path.join(dir, 'x'), root, options) !== null;
}

// Files that knip's result depends on.
export function isKnipRelevant(rel) {
  return (
    /\.(m?[jt]sx?|c[jt]s)$/.test(rel) ||
    /(^|\/)(package\.json|tsconfig[^/]*\.json|knip\.(json|jsonc)|knip\.config\.[cm]?[jt]s)$/.test(
      rel,
    ) ||
    ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'turbo.json'].includes(rel)
  );
}

// Turbo stream output prefixes every line with "<pkg>:typecheck: ". Keep the
// package so the reader knows where a relative path lives.
export function parseTypecheckOutput(output) {
  const errors = [];
  const failed = [];
  for (const line of output.split('\n')) {
    if (/error TS\d+/.test(line)) {
      errors.push(line.replace(/:typecheck: /, ': ').trim());
    } else if (/^\s*Failed:/.test(line)) {
      failed.push(line.trim());
    }
  }
  return { errors: [...new Set(errors)], failed };
}

// oxlint's diagnostics go to stdout; a configuration or plugin failure goes
// to stderr with a non-zero exit and empty stdout, and must be reported too.
export function lintReportFrom(result) {
  if (result.error) return `oxlint did not finish: ${result.error.message}`;
  const out = result.stdout.trim();
  if (out) return out;
  if (result.status !== 0) {
    const err = result.stderr.trim() || '(no output)';
    return `oxlint exited with status ${result.status}:\n${err}`;
  }
  return '';
}

export function truncateLines(text, max) {
  const lines = text.split('\n');
  if (lines.length <= max) return text;
  return `${lines.slice(0, max).join('\n')}\n… (${lines.length - max} more lines)`;
}

export function signature(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function defaultStat(file) {
  try {
    const stats = statSync(file);
    return `${stats.size}:${Math.floor(stats.mtimeMs)}`;
  } catch {
    return 'missing';
  }
}

// Identifies the working state the stop check ran against: the commit plus
// size and mtime of every changed file. A chat-only turn reproduces the
// fingerprint of the last clean run and skips the check entirely.
export function changeFingerprint(
  root,
  files,
  { head = git(['rev-parse', 'HEAD'], root), stat = defaultStat } = {},
) {
  const parts = [head ?? 'no-head'];
  for (const file of files)
    parts.push(`${path.relative(root, file)}=${stat(file)}`);
  return signature(parts.join('\n'));
}

// Among `files`, those modified at or after `sinceMs` (with a small margin).
export function modifiedSince(files, sinceMs, { mtimeOf = defaultMtime } = {}) {
  const threshold = sinceMs - 2000;
  return files.filter((file) => {
    const mtime = mtimeOf(file);
    return mtime !== null && mtime >= threshold;
  });
}

function defaultMtime(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

// The pre-command hook records when each shell command started (keyed by
// tool_use_id, pruned after an hour) so the post-command hook can find the
// files that command wrote, however long it ran.
export function recordCommandStart(root, toolUseId, now = Date.now()) {
  updateState(root, (state) => {
    const starts = state.commandStarts ?? {};
    for (const [id, at] of Object.entries(starts)) {
      if (now - at > 60 * 60 * 1000) delete starts[id];
    }
    starts[toolUseId ?? `anon-${now}`] = now;
    state.commandStarts = starts;
  });
}

// When did the command that just finished start? Its own record when the
// id is known, otherwise the most recent outstanding record, otherwise the
// previous post-edit run, otherwise a minute ago.
export function takeCommandStart(state, toolUseId, now = Date.now()) {
  const starts = state.commandStarts ?? {};
  let since;
  if (toolUseId && starts[toolUseId] !== undefined) {
    since = starts[toolUseId];
    delete starts[toolUseId];
  } else {
    // The pre-command hook fired just before this command, so the most
    // recent record is its start. Anonymous records are dropped once used
    // so a stale one cannot widen the window on a later call.
    const outstanding = Object.values(starts);
    since =
      outstanding.length > 0
        ? Math.max(...outstanding)
        : (state.lastPostEdit ?? now - 60_000);
    for (const id of Object.keys(starts)) {
      if (id.startsWith('anon-')) delete starts[id];
    }
  }
  state.commandStarts = starts;
  return since;
}

function stateFile(root) {
  const dir = path.join(root, 'node_modules', '.cache', 'agent-hooks');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, 'stop-state.json');
}

export function readState(root) {
  try {
    return JSON.parse(readFileSync(stateFile(root), 'utf8'));
  } catch {
    return {};
  }
}

// Hooks from concurrent agents (a subagent's stop check, the main agent's
// shell command) share this file, so every write is a locked
// read-modify-write of the current contents rather than a snapshot taken
// before a long-running check. The lock is an atomically created directory,
// treated as stale after ten seconds; a caller waits up to twelve seconds
// and fails rather than writing unlocked.
export function updateState(root, mutate) {
  const file = stateFile(root);
  const lock = `${file}.lock`;
  // Longer than the stale-lock threshold, so a lock left by a dead process
  // is reclaimed rather than timed out; on timeout the update fails instead
  // of writing without the lock.
  const deadline = Date.now() + 12_000;
  let locked = false;
  while (!locked) {
    try {
      mkdirSync(lock);
      locked = true;
    } catch {
      // Every failure path honours the deadline: a persistent error (a
      // read-only or full disk) must fail fast, not spin.
      if (Date.now() > deadline) break;
      let stale = false;
      try {
        stale = Date.now() - statSync(lock).mtimeMs > 10_000;
      } catch {
        continue;
      }
      if (stale) {
        try {
          rmSync(lock, { recursive: true, force: true });
        } catch {
          // Another process cleared it first.
        }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  if (!locked) {
    throw new Error(`agent-hooks: could not lock ${file} within 12 s`);
  }
  try {
    const state = readState(root);
    mutate(state);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
    return state;
  } finally {
    if (locked) {
      try {
        rmSync(lock, { recursive: true, force: true });
      } catch {
        // Already gone.
      }
    }
  }
}

// pre-push: the pushed revision is checked in place only when it is the
// clean checked-out HEAD; otherwise it is checked out into a temporary
// worktree so unrelated working-tree changes neither mask nor cause findings.
export function knipTargetForPush(pushedSha, { head, porcelain }) {
  return pushedSha === head && porcelain.trim() === ''
    ? 'in-place'
    : 'worktree';
}

// Directories (relative to the repository root) whose node_modules the
// temporary worktree borrows from the current tree instead of installing.
export function nodeModulesDirs(root, manifestPaths) {
  const dirs = new Set(['.']);
  for (const manifest of manifestPaths) dirs.add(path.dirname(manifest));
  return [...dirs].filter((dir) =>
    existsSync(path.join(root, dir, 'node_modules')),
  );
}

// Generated, gitignored inputs that knip needs: the outputs of the tasks
// turbo.json makes `//#knip` depend on (fresco#codegen today). A temporary
// checkout of a pushed revision lacks them, so pre-push borrows them from the
// current tree. turbo.json carries full-line // comments only.
function knipDependencyTasks(root) {
  let config;
  try {
    const text = readFileSync(path.join(root, 'turbo.json'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    config = JSON.parse(text);
  } catch {
    return { tasks: {}, dependencies: [] };
  }
  const tasks = config.tasks ?? {};
  return { tasks, dependencies: tasks['//#knip']?.dependsOn ?? [] };
}

export function knipCodegenOutputs(root) {
  const { tasks, dependencies } = knipDependencyTasks(root);
  const outputs = [];
  for (const dep of dependencies) {
    const [pkg, task] = dep.split('#');
    if (!pkg || !task) continue;
    const dir = workspacePackages(root).get(pkg)?.dir;
    if (!dir) continue;
    for (const glob of tasks[dep]?.outputs ?? []) {
      if (glob.startsWith('!')) continue;
      outputs.push(path.join(dir, glob.replace(/\/\*\*$/, '')));
    }
  }
  return outputs;
}

// The generated inputs knip depends on may be missing (a fresh or cleaned
// checkout) or stale (their sources changed since they were generated), so
// the tasks `//#knip` depends on always run before knip is enforced; turbo
// replays them from cache when nothing changed. Returns false when they
// cannot be produced.
// The source files of the tasks `//#knip` depends on, as repository-relative
// path prefixes (a glob's fixed leading part), for diffing two revisions.
export function knipCodegenInputs(root) {
  const { tasks, dependencies } = knipDependencyTasks(root);
  const inputs = [];
  for (const dep of dependencies) {
    const [pkg, task] = dep.split('#');
    if (!pkg || !task) continue;
    const dir = workspacePackages(root).get(pkg)?.dir;
    if (!dir) continue;
    for (const glob of tasks[dep]?.inputs ?? []) {
      if (glob.startsWith('!') || glob.startsWith('$')) continue;
      inputs.push(path.relative(root, path.join(dir, glob.split(/[*?{]/)[0])));
    }
  }
  return inputs;
}

export function ensureKnipInputs(root) {
  const turbo = binPath(root, 'turbo');
  const { dependencies } = knipDependencyTasks(root);
  if (!turbo || dependencies.length === 0) return false;
  const result = run(
    turbo,
    ['run', ...dependencies, '--output-logs=errors-only'],
    {
      cwd: root,
      env: {
        TURBO_UI: 'stream',
        TURBO_TELEMETRY_DISABLED: '1',
        TURBO_NO_UPDATE_NOTIFIER: '1',
      },
      timeoutMs: 180_000,
    },
  );
  if (result.status !== 0) return false;
  return knipCodegenOutputs(root).every((absolute) => existsSync(absolute));
}

export function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

// Whole-tree gate commands the hooks make redundant. Returns null when the
// command is fine, otherwise { kind, segment } for the offending segment.
// A gate run from inside a workspace package (the tool's working directory,
// or a `cd` earlier in the command) is package-scoped and allowed.
const SCOPE_FLAGS = /(^|\s)(--filter(=|\s)|-F\s|--affected(\s|$))/;

function turboVerdict(args, own, trimmed, scoped) {
  if (SCOPE_FLAGS.test(own) || scoped) return null;
  if (args.some((t) => /^(typecheck|lint|\/\/#lint|\/\/#knip|knip)$/.test(t))) {
    return { kind: 'whole-tree-gate', segment: trimmed };
  }
  return null;
}

// Options that take a separate value, so the value is not a file target.
const VALUE_OPTIONS = new Set([
  '-c',
  '--config',
  '--tsconfig',
  '--ignore-path',
  '--ignore-pattern',
  '-f',
  '--format',
  '--threads',
  '--max-warnings',
  '--stdin-filepath',
  '--report-unused-disable-directives-severity',
  '--fix-kind',
  '--debug',
  '-A',
  '--allow',
  '-W',
  '--warn',
  '-D',
  '--deny',
  '--migrate',
]);

function stripPrefixes(segment) {
  let s = segment.trim();
  // Subshell and brace-group punctuation is not part of the command.
  s = s.replace(/^[({\s]+/, '').replace(/[)}\s]+$/, '');
  let previous;
  do {
    previous = s;
    s = s.replace(/^(\w+=\S*\s+)+/, '');
    s = s.replace(/^(time|nohup|command|nice|xargs)\s+/, '');
    // env's own options (`env -u NAME`, `-i`, `-S str`, `-P path`) precede
    // the assignments and the command.
    s = s.replace(
      /^env\s+((-u\s+\S+|--unset=\S+|-[iv]+|--ignore-environment|-[SP]\s+\S+)\s+)*/,
      '',
    );
    s = s.replace(
      /^timeout\s+((-k|-s|--kill-after|--signal)\s+\S+\s+|-\S+\s+)*\S+\s+/,
      '',
    );
    s = s.replace(/^stdbuf\s+(-\S+\s+)+/, '');
  } while (s !== previous);
  s = s.replace(
    /^(pnpm\s+exec\s+(--\s+)?|pnpm\s+dlx\s+|npx\s+(--yes\s+)?(--\s+)?|(\S*\/)?node_modules\/\.bin\/)/,
    '',
  );
  return s;
}

// Splits a command line into simple commands on `&&`, `||`, `;`, `|` and
// newlines, ignoring separators inside single or double quotes so that text
// such as `--body "run pnpm install && pnpm lint"` stays one argument.
export function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += command[i + 1];
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '\n' || ch === ';') {
      segments.push(current);
      current = '';
      continue;
    }
    if ((ch === '&' || ch === '|') && command[i + 1] === ch) {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === '|') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments;
}

// The script passed to `sh -c '...'`, `bash -lc "..."` and similar, or null.
function shellScriptArgument(tokens) {
  const [head, ...rest] = tokens;
  if (!/^(sh|bash|zsh|dash|ksh)$/.test(head)) return null;
  const index = rest.findIndex((t) => /^-[a-z]*c[a-z]*$/.test(t));
  if (index === -1) return null;
  const script = rest.slice(index + 1).join(' ');
  const match = /^(['"])([\s\S]*)\1$/.exec(script.trim());
  return match ? match[2] : script;
}

const INFO_FLAGS = /^(--version|-V|--help|-h|--rules|--print-config)$/;

// Does a pnpm `--filter` selector narrow the run to specific packages? A
// package name, or a directory selector naming one directory, does; a glob
// (`./**`, `*`), or `.`/`./`/`{.}` from the repository root (every package
// under it), does not. Unknown shapes count as not scoping.
export function filterSelectorScopes(selector, { atRoot }) {
  const value = selector.replace(/^['"]|['"]$/g, '').replace(/^!/, '');
  if (/[*?[\]]/.test(value)) return false;
  const bare = value
    .replace(/^\.\.\./, '')
    .replace(/\.\.\.$/, '')
    .replace(/^\{|\}$/g, '');
  if (bare === '' || bare === '.' || bare === './') return !atRoot;
  return /^(@?[\w.-]+(\/[\w.-]+)*|\.\/[\w.-]+(\/[\w.-]+)*\/?)$/.test(bare);
}

function bareTargets(args) {
  const targets = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (VALUE_OPTIONS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('-') || arg === '.' || arg === './') continue;
    targets.push(arg);
  }
  return targets;
}

// The escape hatch counts only as a shell assignment: a prefix on the gated
// command (`AGENT_GATES=1 pnpm lint`) or an earlier `export AGENT_GATES=1`.
// The text appearing elsewhere (echoed, or inside a heredoc) does not.
const GATE_BYPASS_PREFIX = /^(\w+=\S*\s+)*AGENT_GATES=1(\s|$)/;
const GATE_BYPASS_EXPORT = /^(export\s+)?AGENT_GATES=1\s*$/;

// git global options that take a separate value.
const GIT_GLOBAL_VALUE_OPTIONS = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--super-prefix',
  '--config-env',
]);

export function classifyGateCommand(command, { cwd, root, packageDir } = {}) {
  if (!command) return null;
  const inPackage = (dir) =>
    Boolean(dir && root && (packageDir ?? isPackageDir)(dir, root));
  const resolveDir = (from, target) =>
    from ? path.resolve(from, target.replace(/^['"]|['"]$/g, '')) : null;
  let currentDir = cwd ?? root ?? null;
  let exported = false;
  // A backslash-newline continues the same command line.
  const joined = command.replace(/\\\r?\n/g, ' ');
  for (const raw of splitSegments(stripEmbeddedText(joined))) {
    const trimmed = raw.trim();
    if (GATE_BYPASS_EXPORT.test(trimmed)) {
      exported = true;
      continue;
    }
    if (exported || GATE_BYPASS_PREFIX.test(trimmed)) continue;
    const segment = stripPrefixes(raw);
    if (!segment) continue;
    const tokens = segment.split(/\s+/);
    const [head, ...rest] = tokens;

    if (head === 'cd') {
      const target = rest.find((t) => !t.startsWith('-'));
      if (target && !/^[~$]/.test(target.replace(/^['"]/, ''))) {
        currentDir = resolveDir(currentDir, target) ?? currentDir;
      }
      continue;
    }

    // `sh -c '...'`: classify the script itself, from the same directory.
    const script = shellScriptArgument(tokens);
    if (script !== null) {
      const verdict = classifyGateCommand(script, {
        cwd: currentDir,
        root,
        packageDir,
      });
      if (verdict) return verdict;
      continue;
    }

    if (head === 'git') {
      // Global options (`git -c k=v commit`, `git -C dir commit`) precede
      // the subcommand.
      let i = 0;
      while (i < rest.length && rest[i].startsWith('-')) {
        if (GIT_GLOBAL_VALUE_OPTIONS.has(rest[i])) i += 1;
        i += 1;
      }
      if (
        rest[i] === 'commit' &&
        rest.slice(i + 1).some((t) => t === '--no-verify' || t === '-n')
      ) {
        return { kind: 'no-verify', segment: trimmed };
      }
      continue;
    }

    // Arguments after `--` are passed to the script, not to pnpm or turbo,
    // so a scope flag there does not scope anything.
    const own = segment.split(/\s--(\s|$)/)[0];

    if (/^(pnpm|npm|yarn|bun)$/.test(head)) {
      // pnpm's own options come before the script name: `-C dir`/`--dir dir`
      // run it in that directory, `-w`/`--workspace-root` at the root, and a
      // `--filter` there scopes the run. Anything after the script name is
      // forwarded to the script and scopes nothing.
      let effectiveDir = currentDir;
      let scoped = false;
      let scriptName = null;
      const positional = [];
      for (let i = 0; i < rest.length; i += 1) {
        const t = rest[i];
        if (scriptName === null) {
          if (t === '-C' || t === '--dir') {
            if (rest[i + 1])
              effectiveDir =
                resolveDir(currentDir, rest[i + 1]) ?? effectiveDir;
            i += 1;
            continue;
          }
          const dirMatch = /^(?:-C|--dir)=(.+)$/.exec(t);
          if (dirMatch) {
            effectiveDir = resolveDir(currentDir, dirMatch[1]) ?? effectiveDir;
            continue;
          }
          if (t === '-w' || t === '--workspace-root') {
            effectiveDir = root ?? null;
            continue;
          }
          if (t === '--filter' || t === '-F') {
            if (
              filterSelectorScopes(rest[i + 1] ?? '', {
                atRoot: !inPackage(effectiveDir),
              })
            ) {
              scoped = true;
            }
            i += 1;
            continue;
          }
          if (t.startsWith('--filter=')) {
            if (
              filterSelectorScopes(t.slice('--filter='.length), {
                atRoot: !inPackage(effectiveDir),
              })
            ) {
              scoped = true;
            }
            continue;
          }
          if (t.startsWith('-') || t === 'run') continue;
          scriptName = t;
        }
        positional.push(t);
      }
      // `pnpm turbo run typecheck` is a turbo invocation.
      if (scriptName === 'turbo') {
        const verdict = turboVerdict(
          positional.slice(1).filter((t) => t !== 'run'),
          own,
          trimmed,
          inPackage(effectiveDir),
        );
        if (verdict) return verdict;
        continue;
      }
      if (scoped || inPackage(effectiveDir)) continue;
      if (
        /^(lint|lint:fix|typecheck|knip|format|format:check)$/.test(
          scriptName ?? '',
        )
      ) {
        return { kind: 'whole-tree-gate', segment: trimmed };
      }
      continue;
    }

    if (head === 'turbo') {
      const verdict = turboVerdict(rest, own, trimmed, inPackage(currentDir));
      if (verdict) return verdict;
      continue;
    }

    if (head === 'oxlint' || head === 'oxfmt') {
      if (rest.some((t) => INFO_FLAGS.test(t))) continue;
      if (bareTargets(rest).length === 0 && !inPackage(currentDir)) {
        return { kind: 'whole-tree-gate', segment: trimmed };
      }
      continue;
    }

    if (head === 'knip') {
      if (rest.some((t) => INFO_FLAGS.test(t)) || inPackage(currentDir))
        continue;
      return { kind: 'whole-tree-gate', segment: trimmed };
    }
  }
  return null;
}

export const GATE_EXPLANATION =
  'This repository runs its quality gates for you: every file you edit is ' +
  'formatted and lint-fixed on save (oxfmt + oxlint --fix, remaining errors ' +
  'are reported back to you), the packages you changed and their dependents ' +
  'are typechecked each time you end a turn, pre-commit blocks commits with ' +
  'lint errors, and knip runs on push. Whole-tree lint/typecheck/knip runs take ' +
  'minutes and only duplicate CI. Fix what the hooks report; for an on-demand ' +
  'scoped check run `pnpm agent:check`, and package-scoped runs ' +
  '(`pnpm --filter <pkg> typecheck`, or running inside a package directory) ' +
  'are always allowed. If the whole-tree command is genuinely required (for ' +
  'example after changing lint or TypeScript configuration), prefix it with ' +
  'AGENT_GATES=1.';

export const NO_VERIFY_EXPLANATION =
  '`--no-verify` skips the pre-commit hook, which is the lint gate that ' +
  'replaces manual lint runs in this repository. Commit without it and fix ' +
  'whatever lint-staged reports. If bypassing the hook is genuinely required, ' +
  'prefix the command with AGENT_GATES=1.';
