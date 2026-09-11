import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Repository agent skills are single-sourced: the canonical copy lives in
// .agents/skills/<name>/ and every .claude/skills/<name> entry must be a
// directory symlink to it (see CLAUDE.md). Before this guard, the two trees
// carried independent copies and six skills silently drifted apart.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const claudeSkillsDir = path.join(repoRoot, '.claude', 'skills');
const agentsSkillsDir = path.join(repoRoot, '.agents', 'skills');

test('every .claude/skills entry symlinks its .agents/skills counterpart', () => {
  for (const entry of readdirSync(claudeSkillsDir)) {
    const entryPath = path.join(claudeSkillsDir, entry);
    assert.ok(
      lstatSync(entryPath).isSymbolicLink(),
      `.claude/skills/${entry} must be a symlink into .agents/skills — edit the canonical .agents copy instead of adding a separate file`,
    );
    const target = path.resolve(claudeSkillsDir, readlinkSync(entryPath));
    assert.equal(
      target,
      path.join(agentsSkillsDir, entry),
      `.claude/skills/${entry} must point at .agents/skills/${entry}`,
    );
    assert.ok(
      statSync(path.join(target, 'SKILL.md')).isFile(),
      `.agents/skills/${entry}/SKILL.md must exist`,
    );
  }
});

test('every .agents skill is exposed to Claude Code', () => {
  const claudeEntries = new Set(readdirSync(claudeSkillsDir));
  for (const entry of readdirSync(agentsSkillsDir)) {
    assert.ok(
      claudeEntries.has(entry),
      `.agents/skills/${entry} has no .claude/skills symlink — add one so Claude Code can discover it`,
    );
  }
});
