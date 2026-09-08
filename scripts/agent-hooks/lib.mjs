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
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const FORMAT_EXTENSIONS = new Set([
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

export const LINT_EXTENSIONS = new Set([
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
// scripts/ are compiled by the apps' node tsconfigs).
function isGlobalInput(rel) {
  if (rel.startsWith(`tooling${path.sep}typescript${path.sep}`)) return true;
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
export function isPackageDir(dir, root, options) {
  if (!isUnderRepo(dir, root)) return false;
  return packageForFile(path.join(dir, 'x'), root, options) !== null;
}

// Files that knip's result depends on.
export function isKnipRelevant(rel) {
  return (
    /\.(m?[jt]sx?|c[jt]s)$/.test(rel) ||
    /(^|\/)(package\.json|tsconfig[^/]*\.json|knip\.(json|jsonc)|knip\.config\.[cm]?[jt]s)$/.test(
      rel,
    )
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
  const state = readState(root);
  const starts = state.commandStarts ?? {};
  for (const [id, at] of Object.entries(starts)) {
    if (now - at > 60 * 60 * 1000) delete starts[id];
  }
  starts[toolUseId ?? `anon-${now}`] = now;
  state.commandStarts = starts;
  writeState(root, state);
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

export function writeState(root, state) {
  writeFileSync(stateFile(root), JSON.stringify(state));
}

export function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

// Whole-tree gate commands the hooks make redundant. Returns null when the
// command is fine, otherwise { kind, segment } for the offending segment.
// A gate run from inside a workspace package (the tool's working directory,
// or a `cd` earlier in the command) is package-scoped and allowed.
const SCOPE_FLAGS = /(^|\s)(--filter(=|\s)|-F\s|--affected(\s|$))/;

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
]);

function stripPrefixes(segment) {
  let s = segment.trim();
  s = s.replace(/^(\w+=\S*\s+)+/, '');
  s = s.replace(/^(time|nohup|command)\s+/, '');
  s = s.replace(
    /^(pnpm\s+exec\s+|pnpm\s+dlx\s+|npx\s+(--yes\s+)?|(\S*\/)?node_modules\/\.bin\/)/,
    '',
  );
  return s;
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

export function classifyGateCommand(command, { cwd, root, packageDir } = {}) {
  if (!command) return null;
  const inPackage = (dir) =>
    Boolean(dir && root && (packageDir ?? isPackageDir)(dir, root));
  let currentDir = cwd ?? root ?? null;
  let exported = false;
  const segments = stripEmbeddedText(command).split(/\n|&&|\|\||;|\|/);
  for (const raw of segments) {
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
      if (target && !/^[~$]/.test(target) && currentDir) {
        currentDir = path.resolve(
          currentDir,
          target.replace(/^['"]|['"]$/g, ''),
        );
      }
      continue;
    }

    if (
      head === 'git' &&
      rest[0] === 'commit' &&
      rest.some((t) => t === '--no-verify' || t === '-n')
    ) {
      return { kind: 'no-verify', segment: trimmed };
    }

    if (/^(pnpm|npm|yarn|bun)$/.test(head)) {
      if (SCOPE_FLAGS.test(segment) || inPackage(currentDir)) continue;
      const script = rest
        .filter((t) => !t.startsWith('-'))
        .filter((t) => t !== 'run')[0];
      if (
        /^(lint|lint:fix|typecheck|knip|format|format:check)$/.test(
          script ?? '',
        )
      ) {
        return { kind: 'whole-tree-gate', segment: trimmed };
      }
      continue;
    }

    if (head === 'turbo') {
      if (SCOPE_FLAGS.test(segment) || inPackage(currentDir)) continue;
      if (
        rest.some((t) => /^(typecheck|lint|\/\/#lint|\/\/#knip|knip)$/.test(t))
      ) {
        return { kind: 'whole-tree-gate', segment: trimmed };
      }
      continue;
    }

    if (head === 'oxlint' || head === 'oxfmt') {
      if (bareTargets(rest).length === 0 && !inPackage(currentDir)) {
        return { kind: 'whole-tree-gate', segment: trimmed };
      }
      continue;
    }

    if (head === 'knip' && !inPackage(currentDir)) {
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
