# Agent hooks

These scripts run automatically inside Claude Code and Codex sessions so that
agents get formatting, lint, typecheck, and `knip` feedback without running
the whole-tree gates themselves. Both harnesses run a hook as a subprocess
with one JSON event on stdin and read a JSON verdict from stdout, and both
accept the same verdict fields, so one script serves both.

| Event                     | Script           | What it does                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse` (file edit) | `post-edit.mjs`  | Runs `oxfmt` and `oxlint --fix` on the edited file(s); reports reformatting and remaining lint errors as extra context. Under a second per edit. A shell command names no path, so for those it formats the uncommitted files modified since the previous run. |
| `Stop`, `SubagentStop`    | `stop-check.mjs` | Typechecks the packages changed on the branch plus their dependents via turbo (cached); skipped when nothing changed since the last clean run; returns a block decision so the agent fixes failures.                                                           |
| `PreToolUse` (shell)      | `pre-bash.mjs`   | Refuses whole-tree `pnpm lint`/`typecheck`/`knip`, bare `oxlint`/`oxfmt`, and `git commit --no-verify`, explaining the alternative. `AGENT_GATES=1` bypasses.                                                                                                  |

`pnpm agent:test` (`agent-test.mjs`) runs, in each package that contains
changed files, only the vitest tests whose import graph touches the changed
files (`vitest --changed <merge-base>`); other arguments go to vitest. The
packages that consume the changed code are listed but only run with
`--dependents`, because a change in a widely imported package legitimately
reaches most of the repository's tests (a shared-consts edit measured at
eight minutes) and CI covers them. It is guidance rather than a gate: test runs are already scoped in practice, and a
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
- `.husky/pre-commit` and `.husky/pre-push` are resolved through
  `core.hooksPath`. Claude Code worktrees point that at the main checkout's
  `.husky/_`, so they run the main checkout's copies of both scripts: the
  blocking pre-commit and the knip pre-push apply there only once `main`
  carries them and the main checkout is updated. Codex worktrees run their
  own copies.

## Stop-hook state

`node_modules/.cache/agent-hooks/stop-state.json` (per worktree) records two
things. The fingerprint of the last clean run (HEAD plus size and mtime of
every changed file) lets a turn that changed nothing skip the check. A block
decision makes the agent continue with the reason as its next instruction;
the failure signature is recorded so that the same failure set blocks at most
four consecutive stops, continuations and fresh turns alike; after that the
agent is allowed to stop and report, and a changed failure set starts a new
allowance.
