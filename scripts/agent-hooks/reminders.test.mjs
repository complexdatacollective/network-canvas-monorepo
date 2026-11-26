import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, test } from 'vitest';

import { interfaceCopyFiles, isReaderFacingText } from './lib.mjs';

// These tests run the hook scripts as the harness does: one JSON event on
// stdin, the verdict on stdout, inside a throwaway git repository.
const hooksDir = path.dirname(fileURLToPath(import.meta.url));

const cleanup = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const tempDir = (prefix) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanup.push(dir);
  return dir;
};

const gitIn = (args, cwd) => {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
};

const writeAt = (root, rel, text) => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};

// A line that exists only in the fake skill, so finding it in the hook's
// output proves that the checklist is read from the inspected tree.
const SENTINEL = 'Is every sentinel question answered?';
const SKILL = [
  '---',
  'name: writing-user-facing-text',
  '---',
  '',
  '# Writing user-facing text',
  '',
  '## Checking a sentence',
  '',
  'Ask these questions:',
  '',
  `1. ${SENTINEL}`,
  '',
  '## Text that keeps its exact wording',
  '',
  'NOT PART OF THE CHECKLIST',
  '',
].join('\n');

function fakeRepo({ skill = SKILL } = {}) {
  const root = tempDir('agent-hooks-wording-');
  gitIn(['init', '-q', '-b', 'main', '.'], root);
  if (skill !== null) {
    writeAt(root, '.agents/skills/writing-user-facing-text/SKILL.md', skill);
  }
  return root;
}

// Runs post-edit.mjs for an Edit event. The fake repository has no
// node_modules, so the formatters are absent and the only possible output is
// the wording reminder.
function postEdit(root, rel, { sessionId, tmpDir, newString = 'changed' }) {
  const file = writeAt(root, rel, `${newString}\n`);
  const result = spawnSync(
    process.execPath,
    [path.join(hooksDir, 'post-edit.mjs')],
    {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: sessionId,
        cwd: root,
        tool_name: 'Edit',
        tool_input: { file_path: file, old_string: 'x', new_string: newString },
      }),
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tmpDir, CLAUDE_PROJECT_DIR: '' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('a changeset edit brings the full checklist once per session, then one line', () => {
  const root = fakeRepo();
  const tmpDir = tempDir('agent-hooks-marker-');

  const first = postEdit(root, '.changeset/new-feature.md', {
    sessionId: 'session-a',
    tmpDir,
  });
  assert.ok(first, 'a changeset edit produced no reminder');
  assert.match(first, /\.changeset\/new-feature\.md/);
  assert.ok(first.includes(SENTINEL), 'the checklist is missing');
  assert.ok(
    !first.includes('NOT PART OF THE CHECKLIST'),
    'the checklist runs past its section',
  );
  assert.ok(first.includes('.agents/skills/writing-user-facing-text/SKILL.md'));

  const second = postEdit(root, 'apps/documentation/README.md', {
    sessionId: 'session-a',
    tmpDir,
  });
  assert.ok(second, 'the second edit produced no reminder');
  assert.ok(
    !second.includes(SENTINEL),
    'the second edit repeated the full checklist',
  );
  assert.equal(second.split('\n').length, 1);
  assert.ok(second.includes('writing-user-facing-text'));

  const otherSession = postEdit(root, '.changeset/other.md', {
    sessionId: 'session-b',
    tmpDir,
  });
  assert.ok(otherSession?.includes(SENTINEL), 'a new session missed the list');
});

test('code and non-English text get no wording reminder', () => {
  const root = fakeRepo();
  const tmpDir = tempDir('agent-hooks-marker-');
  for (const rel of [
    'packages/interview/src/Shell.ts',
    'apps/documentation/docs/get-started/glossary.fr.mdx',
    'apps/networkcanvas.com/content/updates/release.de.md',
    'apps/networkcanvas.com/messages/es.json',
    'packages/fresco-ui/src/locales/zh-Hans.json',
    'packages/fresco-ui/src/locales/en-GB.source.json',
    '.changeset/config.json',
  ]) {
    assert.equal(
      postEdit(root, rel, { sessionId: 'session-c', tmpDir }),
      null,
      `${rel} produced a reminder`,
    );
  }
});

test('an edit that adds a defaultMessage to code gets the reminder', () => {
  const root = fakeRepo();
  const tmpDir = tempDir('agent-hooks-marker-');
  const context = postEdit(root, 'packages/interview/src/messages.ts', {
    sessionId: 'session-d',
    tmpDir,
    newString: "defaultMessage: 'Add a person',",
  });
  assert.ok(context?.includes('packages/interview/src/messages.ts'));
});

test('without the skill section the reminder is a one-line pointer', () => {
  const root = fakeRepo({ skill: '# Writing user-facing text\n' });
  const tmpDir = tempDir('agent-hooks-marker-');
  const context = postEdit(root, 'CHANGELOG.md', {
    sessionId: 'session-e',
    tmpDir,
  });
  assert.ok(context, 'no reminder without the section');
  assert.equal(context.split('\n').length, 1);
  assert.ok(context.includes('.agents/skills/writing-user-facing-text'));
});

test('classifies English text that people read by path', () => {
  const yes = [
    '.changeset/fix-thing.md',
    '.changeset/README.md',
    'README.md',
    'apps/architect/CHANGELOG.md',
    'apps/interviewer/RELEASING.md',
    'apps/documentation/docs/get-started/glossary.en.mdx',
    'apps/documentation/docs/collect-data/fresco/cloud-pricing.en.md',
    'apps/networkcanvas.com/content/updates/release.en-US.md',
    'apps/networkcanvas.com/content/updates/release.en-GB.md',
    'apps/documentation/messages/en.json',
    'apps/networkcanvas.com/messages/en-GB.json',
    'packages/fresco-ui/src/locales/en-GB.json',
    'packages/interview/src/locales/wording/en-GB.json',
  ];
  const no = [
    '.changeset/config.json',
    'apps/documentation/docs/get-started/glossary.es.mdx',
    'apps/networkcanvas.com/content/updates/release.zh-Hans.md',
    'apps/networkcanvas.com/messages/pt-BR.json',
    'packages/fresco-ui/src/locales/en.json',
    'packages/fresco-ui/src/locales/en-GB.source.json',
    'packages/fresco-ui/src/locales/fr.json',
    'packages/interview/src/Shell.tsx',
    'apps/networkcanvas.com/content/protocol-gallery.csv',
    'docs/notes.md',
  ];
  for (const rel of yes) assert.ok(isReaderFacingText(rel), rel);
  for (const rel of no) assert.ok(!isReaderFacingText(rel), rel);
});

test('finds interface copy in the text that Codex patches add', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: packages/a/src/messages.ts',
    '@@',
    "-  defaultMessage: 'Old',",
    "+  defaultMessage: 'New',",
    '*** Update File: packages/b/src/logic.ts',
    "-  defaultMessage: 'Removed only',",
    '+  return 1;',
    '*** End Patch',
  ].join('\n');
  assert.deepEqual(
    interfaceCopyFiles(
      { tool_name: 'apply_patch', tool_input: { patch } },
      '/repo',
    ),
    ['/repo/packages/a/src/messages.ts'],
  );
});

// A main checkout with two skills, `.claude/skills/<name>` symlinked to
// `.agents/skills/<name>` as in this repository, and a linked worktree.
function checkoutWithWorktree() {
  const dir = tempDir('agent-hooks-skills-');
  const main = path.join(dir, 'main');
  const worktree = path.join(dir, 'worktree');
  mkdirSync(main);
  gitIn(['init', '-q', '-b', 'main', '.'], main);
  for (const name of ['alpha', 'beta']) {
    writeAt(main, `.agents/skills/${name}/SKILL.md`, `# ${name}\n`);
    mkdirSync(path.join(main, '.claude', 'skills'), { recursive: true });
    symlinkSync(
      `../../.agents/skills/${name}`,
      path.join(main, '.claude', 'skills', name),
    );
  }
  gitIn(['add', '-A'], main);
  gitIn(['commit', '-q', '-m', 'skills'], main);
  gitIn(['worktree', 'add', '-q', '-b', 'work', worktree], main);
  return { main, worktree };
}

function sessionStart(cwd) {
  const result = spawnSync(
    process.execPath,
    [path.join(hooksDir, 'session-start.mjs')],
    {
      input: JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'startup',
        cwd,
      }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout.trim()) return null;
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('the session start warns about skills that the main checkout lacks or has differently', () => {
  const { main, worktree } = checkoutWithWorktree();
  writeAt(worktree, '.agents/skills/beta/SKILL.md', '# beta, revised\n');
  writeAt(worktree, '.agents/skills/gamma/SKILL.md', '# gamma\n');
  const context = sessionStart(worktree);
  assert.ok(context, 'no warning about stale skills');
  assert.ok(context.includes(main), 'the warning does not name the checkout');
  assert.match(context, /Missing from the main checkout[^\n]*: gamma\./);
  assert.match(context, /Different in the main checkout[^\n]*: beta\./);
  assert.ok(!context.includes('alpha'), 'an unchanged skill was reported');
  assert.ok(context.includes('.agents/skills/<name>/SKILL.md'));
});

test('the session start says nothing when the skills match or outside a worktree', () => {
  const { main, worktree } = checkoutWithWorktree();
  assert.equal(sessionStart(worktree), null);
  writeAt(main, '.agents/skills/alpha/SKILL.md', '# alpha, uncommitted\n');
  assert.equal(sessionStart(main), null, 'the main checkout was warned');
});
