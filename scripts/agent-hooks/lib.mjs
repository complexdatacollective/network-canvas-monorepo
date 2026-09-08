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

// Everything that differs from origin/main: uncommitted work (staged, unstaged
// and untracked) plus commits on this branch. Paths are absolute; deleted
// files are included so their package still gets checked.
export function changedFiles(root) {
  const files = new Set();
  const status = run(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root },
  );
  if (status.status === 0) {
    const entries = status.stdout.split('\0');
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || entry.length < 4) continue;
      const code = entry.slice(0, 2);
      files.add(entry.slice(3));
      if (code[0] === 'R' || code[0] === 'C') {
        // A rename/copy record is followed by the original path.
        i += 1;
      }
    }
  }
  const base =
    git(['merge-base', 'HEAD', 'origin/main'], root) ??
    git(['merge-base', 'HEAD', 'main'], root);
  if (base) {
    const diff = git(['diff', '--name-only', base, 'HEAD'], root);
    if (diff) for (const line of diff.split('\n')) if (line) files.add(line);
  }
  return [...files]
    .sort((a, b) => a.localeCompare(b))
    .map((rel) => path.join(root, rel));
}

function isGlobalConfig(rel) {
  return (
    rel.startsWith(`tooling${path.sep}typescript${path.sep}`) ||
    [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'turbo.json',
      'tsconfig.json',
    ].includes(rel)
  );
}

function defaultReadPackage(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

// Maps changed files to the workspace packages whose `typecheck` script must
// run. `all` is set when a file every package depends on changed.
export function packagesForFiles(
  files,
  root,
  { readPackage = defaultReadPackage } = {},
) {
  const names = new Set();
  let all = false;
  const cache = new Map();
  for (const file of files) {
    const rel = path.relative(root, file);
    if (isGlobalConfig(rel)) {
      all = true;
      continue;
    }
    let dir = path.dirname(file);
    let found = null;
    while (dir !== root && isUnderRepo(dir, root)) {
      if (!cache.has(dir))
        cache.set(dir, readPackage(path.join(dir, 'package.json')));
      const pkg = cache.get(dir);
      if (pkg) {
        found = pkg;
        break;
      }
      dir = path.dirname(dir);
    }
    if (found?.name && found.scripts?.typecheck) names.add(found.name);
  }
  return { packages: [...names].sort((a, b) => a.localeCompare(b)), all };
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
const SCOPE_FLAGS = /(^|\s)(--filter(=|\s)|-F\s|--affected(\s|$))/;

function stripPrefixes(segment) {
  let s = segment.trim();
  // Leading env assignments, `time`, `nohup`, and `cd dir &&`-style prefixes
  // were split away already; drop assignments and common wrappers.
  s = s.replace(/^(\w+=\S*\s+)+/, '');
  s = s.replace(/^(time|nohup|command)\s+/, '');
  s = s.replace(
    /^(pnpm\s+exec\s+|pnpm\s+dlx\s+|npx\s+(--yes\s+)?|(\S*\/)?node_modules\/\.bin\/)/,
    '',
  );
  return s;
}

function bareTargets(args) {
  return args.filter(
    (arg) => !arg.startsWith('-') && arg !== '.' && arg !== './',
  );
}

export function classifyGateCommand(command) {
  if (!command || /(^|\s)AGENT_GATES=1(\s|$)/.test(command)) return null;
  const segments = stripEmbeddedText(command).split(/\n|&&|\|\||;|\|/);
  for (const raw of segments) {
    const segment = stripPrefixes(raw);
    if (!segment) continue;
    const tokens = segment.split(/\s+/);
    const [head, ...rest] = tokens;

    if (
      head === 'git' &&
      rest[0] === 'commit' &&
      rest.some((t) => t === '--no-verify' || t === '-n')
    ) {
      return { kind: 'no-verify', segment: raw.trim() };
    }

    if (/^(pnpm|npm|yarn|bun)$/.test(head)) {
      if (SCOPE_FLAGS.test(segment)) continue;
      const script = rest
        .filter((t) => !t.startsWith('-'))
        .filter((t) => t !== 'run')[0];
      if (
        /^(lint|lint:fix|typecheck|knip|format|format:check)$/.test(
          script ?? '',
        )
      ) {
        return { kind: 'whole-tree-gate', segment: raw.trim() };
      }
      continue;
    }

    if (head === 'turbo') {
      if (SCOPE_FLAGS.test(segment)) continue;
      if (
        rest.some((t) => /^(typecheck|lint|\/\/#lint|\/\/#knip|knip)$/.test(t))
      ) {
        return { kind: 'whole-tree-gate', segment: raw.trim() };
      }
      continue;
    }

    if (head === 'oxlint' || head === 'oxfmt') {
      if (bareTargets(rest).length === 0) {
        return { kind: 'whole-tree-gate', segment: raw.trim() };
      }
      continue;
    }

    if (head === 'knip') {
      return { kind: 'whole-tree-gate', segment: raw.trim() };
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
  'scoped check run `pnpm agent:check`. If the whole-tree command is genuinely ' +
  'required (for example after changing lint or TypeScript configuration), ' +
  'prefix it with AGENT_GATES=1.';

export const NO_VERIFY_EXPLANATION =
  '`--no-verify` skips the pre-commit hook, which is the lint gate that ' +
  'replaces manual lint runs in this repository. Commit without it and fix ' +
  'whatever lint-staged reports. If bypassing the hook is genuinely required, ' +
  'prefix the command with AGENT_GATES=1.';
