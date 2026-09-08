#!/usr/bin/env node
// PreToolUse hook for shell commands: refuses whole-tree lint/typecheck/knip
// runs (the other hooks make them redundant and they cost minutes) and
// `git commit --no-verify`, explaining the alternative. Package-scoped runs,
// including those from inside a package directory, are allowed. AGENT_GATES=1
// in the command bypasses the refusal.
import {
  GATE_EXPLANATION,
  NO_VERIFY_EXPLANATION,
  classifyGateCommand,
  emit,
  readHookInput,
  resolveRepoRoot,
} from './lib.mjs';

const input = readHookInput();
const toolInput = input.tool_input ?? input.toolInput ?? {};
const command =
  typeof toolInput.command === 'string'
    ? toolInput.command
    : Array.isArray(toolInput.command)
      ? toolInput.command.join(' ')
      : (toolInput.cmd ?? '');

const root = resolveRepoRoot(input);
const verdict = classifyGateCommand(String(command), {
  cwd: toolInput.workdir ?? toolInput.cwd ?? input.cwd,
  root,
});
if (!verdict) process.exit(0);

const explanation =
  verdict.kind === 'no-verify' ? NO_VERIFY_EXPLANATION : GATE_EXPLANATION;
emit({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: `Refused \`${verdict.segment}\`. ${explanation}`,
  },
});
