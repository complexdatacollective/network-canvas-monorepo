# Agent hooks

These scripts run automatically inside Claude Code and Codex sessions so that
agents get formatting, lint, typecheck, and `knip` feedback without running
the whole-tree gates themselves. Both harnesses run a hook as a subprocess
with one JSON event on stdin and read a JSON verdict from stdout, and both
accept the same verdict fields, so one script serves both.

| Event                     | Script           | What it does                                                                                                                                                                                         |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` (file edit) | `post-edit.mjs`  | Runs `oxfmt` and `oxlint --fix` on the edited file(s); reports reformatting and remaining lint errors as extra context. Under a second per edit.                                                     |
| `Stop`, `SubagentStop`    | `stop-check.mjs` | Typechecks the packages changed on the branch plus their dependents via turbo (cached); skipped when nothing changed since the last clean run; returns a block decision so the agent fixes failures. |
| `PreToolUse` (shell)      | `pre-bash.mjs`   | Refuses whole-tree `pnpm lint`/`typecheck`/`knip`, bare `oxlint`/`oxfmt`, and `git commit --no-verify`, explaining the alternative. `AGENT_GATES=1` bypasses.                                        |

`pnpm agent:test` (`agent-test.mjs`) runs, in each package that contains
changed files, only the vitest tests whose import graph touches the changed
files (`vitest --changed <merge-base>`); extra arguments go to vitest. It is
guidance rather than a gate: test runs are already scoped in practice, and a
test that reads a fixture through the filesystem is not selected by the
import graph, so a package-wide run is still the right call sometimes.

`pnpm agent:check` runs the stop check on demand and additionally runs `knip`
and lints and format-checks the changed files. `knip` itself is a pre-push
gate (`.husky/pre-push`): once per branch push, the last local moment before
CI.

## Wiring

- Claude Code: `.claude/settings.json`. Hooks apply to subagents, teammates,
  and headless runs. `$CLAUDE_PROJECT_DIR` is the worktree root.
- Codex: `.codex/hooks.json`. File edits arrive as `apply_patch` (or as
  `Bash` when the model applies a patch through the shell), and the touched
  paths are read from the patch text and from the tool response's `A/M/D`
  list. Codex has no project-dir variable, so the commands resolve the script
  through `git rev-parse --show-toplevel`.

## Rollout notes

- Codex trusts hook _definitions_ by hash. After `.codex/hooks.json` changes,
  each machine must re-trust it (`/hooks` in the Codex CLI, or the app's hooks
  review). The scripts are referenced by path and are not part of the hash, so
  changing them needs no re-trust. Keep this file stable and put behaviour in
  the scripts.
- In a linked git worktree Codex reads `.codex/hooks.json` from the main
  checkout, not the worktree, while the script path resolves inside the
  worktree. Claude Code reads `.claude/settings.json` from the worktree.
- Claude Code snapshots hooks at session start; a running session picks up
  changes only after a restart.
- `.husky/pre-commit` is resolved through `core.hooksPath`. Claude Code
  worktrees point that at the main checkout's `.husky/_`, so they run the main
  checkout's copy of the hook script; Codex worktrees run their own copy.

## Stop-hook state

`node_modules/.cache/agent-hooks/stop-state.json` (per worktree) records two
things. The fingerprint of the last clean run (HEAD plus size and mtime of
every changed file) lets a turn that changed nothing skip the check. A block
decision makes the agent continue with the reason as its next instruction;
the failure signature is recorded so that when the agent stops again with the
same failures, or after four attempts, it is allowed to stop and report
instead of looping.
