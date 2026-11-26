#!/usr/bin/env node
// SessionStart hook: warns a session in a linked worktree about project
// skills that it cannot use as the worktree has them. Claude Code lists
// project skills from the main checkout's `.claude/skills`, while CLAUDE.md is
// read from the worktree, so a stale main checkout hides skills that CLAUDE.md
// tells the agent to invoke, or serves old text for them. Reads files only
// (no network, no installs) and stays silent on any error.
import {
  emit,
  mainCheckout,
  readHookInput,
  resolveRepoRoot,
  skillDrift,
  staleSkillsMessage,
} from './lib.mjs';

try {
  const input = readHookInput();
  const root = resolveRepoRoot(input);
  const main = mainCheckout(root);
  const message = main ? staleSkillsMessage(main, skillDrift(root, main)) : '';
  if (message) {
    emit({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: message,
      },
    });
  }
} catch {
  // A warning is never worth a failed session start.
}
