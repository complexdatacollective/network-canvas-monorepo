#!/usr/bin/env node
// PreToolUse hook for shell commands: refuses whole-tree lint/typecheck/knip
// runs (the other hooks make them redundant and they cost minutes) and
// `git commit --no-verify`, explaining the alternative. AGENT_GATES=1 in the
// command bypasses the refusal.
import {
  GATE_EXPLANATION,
  NO_VERIFY_EXPLANATION,
  classifyGateCommand,
  emit,
  readHookInput,
} from './lib.mjs';

const input = readHookInput();
const toolInput = input.tool_input ?? input.toolInput ?? {};
const command =
  typeof toolInput.command === 'string'
    ? toolInput.command
    : Array.isArray(toolInput.command)
      ? toolInput.command.join(' ')
      : (toolInput.cmd ?? '');

const verdict = classifyGateCommand(String(command));
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
